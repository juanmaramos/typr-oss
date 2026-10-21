import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateUpdaterRelease } from "./check-release-updater.mjs";
import { readReleaseNotes } from "./release-notes.mjs";

function fixture() {
  const repository = "owner/app", version = "1.2.3", tag = "v1.2.3";
  const names = {
    "darwin-aarch64": "App_aarch64.app.tar.gz",
    "darwin-x86_64": "App_x64.app.tar.gz",
    "windows-x86_64": "App_1.2.3_x64-setup.exe",
  };
  const asset = name => ({
    name,
    size: 123,
    browser_download_url: `https://github.com/${repository}/releases/download/${tag}/${name}`,
  });
  return {
    notes: "- Improved transcription.\n- Updated translations.",
    repository,
    version,
    tag,
    release: {
      body: "- Improved transcription.\n- Updated translations.",
      draft: true,
      tag_name: tag,
      assets: Object.values(names).flatMap(name => [asset(name), asset(`${name}.sig`)]),
    },
    manifest: {
      notes: "- Improved transcription.\n- Updated translations.",
      version,
      platforms: Object.fromEntries(
        Object.entries(names).map((
          [platform, name],
        ) => [platform, { url: asset(name).browser_download_url, signature: `signature-${name}` }]),
      ),
    },
    signatures: Object.fromEntries(Object.values(names).map(name => [`${name}.sig`, `signature-${name}\n`])),
  };
}

test("a complete signed draft has one payload per supported platform", () => {
  assert.equal(validateUpdaterRelease(fixture()).length, 3);
});
test("draft asset URLs resolve to the intended published tag", () => {
  const data = fixture();
  for (const asset of data.release.assets) {
    asset.browser_download_url = asset.browser_download_url.replace("/v1.2.3/", "/untagged-123456/");
  }
  assert.equal(validateUpdaterRelease(data).length, 3);
  data.release.assets[0].browser_download_url = "https://example.com/untagged-123456/App_aarch64.app.tar.gz";
  assert.throws(() => validateUpdaterRelease(data));
});
test("a concurrent upload that loses any platform cannot publish", () => {
  for (const platform of ["darwin-aarch64", "darwin-x86_64", "windows-x86_64"]) {
    const data = fixture();
    delete data.manifest.platforms[platform];
    assert.throws(() => validateUpdaterRelease(data), /Missing updater platform/);
  }
});
test("public, mismatched or incomplete release data cannot publish", () => {
  for (
    const mutate of [
      data => data.release.draft = false,
      data => data.release.tag_name = "v0.0.1",
      data => data.manifest.version = "0.0.1",
      data => data.release.assets = data.release.assets.filter(asset => !asset.name.endsWith(".sig")),
      data => data.manifest.platforms["darwin-aarch64"].signature = "",
      data => data.signatures["App_aarch64.app.tar.gz.sig"] = "different-signature",
      data => data.release.assets[0].size = 0,
      data => data.manifest.platforms["darwin-aarch64"].url = data.manifest.platforms["darwin-x86_64"].url,
      data => data.manifest.platforms["darwin-aarch64"].url = "https://example.com/App_aarch64.app.tar.gz",
    ]
  ) {
    const data = fixture();
    mutate(data);
    assert.throws(() => validateUpdaterRelease(data));
  }
});
test("workflow stages drafts, serializes manifest writers, and publishes only after the complete matrix", () => {
  const source = readFileSync(new URL("../.github/workflows/oss_release.yaml", import.meta.url), "utf8");
  assert.match(source, /max-parallel: 1/);
  assert.match(source, /all\(\.draft\)/);
  assert(source.indexOf("Refuse overwriting a published release") < source.indexOf("uses: tauri-apps/tauri-action"));
  assert.match(source, /releaseDraft: true/);
  assert.doesNotMatch(source.split("\n  publish:")[0], /draft=false|releaseDraft: false/);
  assert.match(source, /publish:\n[\s\S]*?needs: build/);
  assert(source.indexOf("node scripts/check-release-updater.mjs") < source.indexOf("run: gh release edit"));
});

test("release and updater notes must match the same canonical changes", () => {
  for (const target of ["body", "notes"]) {
    for (const replacement of [undefined, "", "Signed and notarized builds.", "- Other changes."]) {
      const data = fixture();
      if (target === "body") {
        data.release.body = replacement;
      } else {
        data.manifest.notes = replacement;
      }
      assert.throws(() => validateUpdaterRelease(data), /from the release changes/);
    }
  }
  const data = fixture();
  data.notes = "";
  assert.throws(() => validateUpdaterRelease(data), /Release changes must be provided/);
});

test("each version needs a nonempty list of release changes", () => {
  const directory = mkdtempSync(join(tmpdir(), "release-changes-"));
  try {
    assert.throws(() => readReleaseNotes("1.2.3", directory), /ENOENT/);
    for (const notes of ["", "  \n", "Signed and notarized builds."]) {
      writeFileSync(join(directory, "1.2.3.md"), notes);
      assert.throws(() => readReleaseNotes("1.2.3", directory), /list of changes/);
    }
    writeFileSync(join(directory, "1.2.3.md"), "\n- Improved transcription.\n");
    assert.equal(readReleaseNotes("1.2.3", directory), "- Improved transcription.");
    assert.throws(() => readReleaseNotes("../other", directory), /Invalid release version/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("workflow output preserves the complete multiline change list", () => {
  const directory = mkdtempSync(join(tmpdir(), "release-output-"));
  try {
    const output = join(directory, "output");
    const config = JSON.parse(
      readFileSync(new URL("../apps/desktop/src-tauri/tauri.conf.json", import.meta.url), "utf8"),
    );
    execFileSync(process.execPath, [fileURLToPath(new URL("./release-notes.mjs", import.meta.url))], {
      env: { ...process.env, RELEASE_VERSION: config.version, GITHUB_OUTPUT: output },
    });
    const contents = readFileSync(output, "utf8");
    const delimiter = contents.split("\n")[0].slice("notes<<".length);
    assert.equal(contents, `notes<<${delimiter}\n${readReleaseNotes(config.version)}\n${delimiter}\n`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
