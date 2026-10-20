import { execFileSync } from "node:child_process";
import { mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// Materialize only Git's index. Unstaged translations cannot make staged code pass.
// Git checkout-index preserves file modes; neither the worktree nor index changes.
export async function withStagedSnapshot(root, callback) {
  const snapshot = await mkdtemp(path.join(tmpdir(), "typr-translations-index-"));
  try {
    execFileSync("git", ["checkout-index", "--all", `--prefix=${snapshot}${path.sep}`], { cwd: root });
    // Dependencies are read-only and intentionally excluded from the staged tree.
    const tracked = execFileSync("git", ["ls-files", "-z", "**/package.json", "package.json"], {
      cwd: root,
      encoding: "utf8",
    }).split("\0").filter(Boolean);
    for (const filename of tracked) {
      const dir = path.dirname(filename);
      try {
        await symlink(path.join(root, dir, "node_modules"), path.join(snapshot, dir, "node_modules"), "dir");
      } catch (error) {
        if (error.code !== "EEXIST") {
          throw error;
        }
      }
    }
    return await callback(snapshot);
  } finally {
    await rm(snapshot, { recursive: true, force: true });
  }
}

export async function checkStagedTranslations(root = repoRoot) {
  await withStagedSnapshot(root, async (snapshot) => {
    const checker = path.join(snapshot, "apps/desktop/scripts/check-translations.mjs");
    execFileSync(process.execPath, [checker, snapshot], { cwd: snapshot, stdio: "inherit" });
  });
}

const invokedPath = process.argv[1] ? await realpath(process.argv[1]).catch(() => null) : null;
if (fileURLToPath(import.meta.url) === invokedPath) {
  checkStagedTranslations().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
