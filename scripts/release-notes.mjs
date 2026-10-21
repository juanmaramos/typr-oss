import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function readReleaseNotes(version, directory = fileURLToPath(new URL("../docs/releases/", import.meta.url))) {
  assert(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version), "Invalid release version");
  const notes = readFileSync(join(directory, `${version}.md`), "utf8").trim();
  assert(/^\s*- \S/m.test(notes), "Release notes must include a list of changes");
  return notes;
}

function main() {
  const config = JSON.parse(
    readFileSync(new URL("../apps/desktop/src-tauri/tauri.conf.json", import.meta.url), "utf8"),
  );
  const notes = readReleaseNotes(process.env.RELEASE_VERSION || config.version);
  if (process.env.GITHUB_OUTPUT) {
    const delimiter = randomUUID();
    appendFileSync(process.env.GITHUB_OUTPUT, `notes<<${delimiter}\n${notes}\n${delimiter}\n`);
  } else {
    console.log(notes);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
