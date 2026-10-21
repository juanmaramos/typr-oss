import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { readReleaseNotes } from "./release-notes.mjs";

const requiredPlatforms = {
  "darwin-aarch64": /_aarch64\.app\.tar\.gz$/,
  "darwin-x86_64": /_x64\.app\.tar\.gz$/,
  "windows-x86_64": /_x64-setup\.exe$/,
};

/** A draft may become the updater's latest release only with every signed target present. */
export function validateUpdaterRelease({ release, manifest, signatures, repository, version, tag, notes }) {
  assert.equal(release.draft, true, "Release must remain draft until verification finishes");
  assert.equal(release.tag_name, tag, "Release tag differs from the requested build");
  assert.equal(manifest.version, version, "Updater version differs from the app");
  assert(notes?.trim(), "Release changes must be provided");
  assert.equal(release.body?.trim(), notes.trim(), "Release body differs from the release changes");
  assert.equal(manifest.notes?.trim(), notes.trim(), "Updater notes differ from the release changes");
  const assets = new Map(release.assets.map(asset => [asset.name, asset]));
  const payloads = new Set();
  for (const [platform, suffix] of Object.entries(requiredPlatforms)) {
    assert(manifest.platforms?.[platform], `Missing updater platform: ${platform}`);
    const filename = decodeURIComponent(new URL(manifest.platforms[platform].url).pathname.split("/").at(-1));
    assert(suffix.test(filename), `Wrong architecture or installer for ${platform}`);
  }
  for (const [platform, entry] of Object.entries(manifest.platforms)) {
    const url = new URL(entry.url);
    const filename = decodeURIComponent(url.pathname.split("/").at(-1));
    assert(filename && !filename.includes("/") && !filename.includes("\\"), "Invalid asset name");
    const asset = assets.get(filename);
    assert(asset?.size > 0, `Missing updater payload: ${platform}`);
    assert.equal(url.origin, "https://github.com", "Updater must use the official GitHub host");
    assert.equal(url.search + url.hash, "", "Updater URL cannot contain query or fragment");
    assert.equal(
      decodeURIComponent(url.pathname),
      `/${repository}/releases/download/${tag}/${filename}`,
      "Updater URL differs from the requested release",
    );
    const uploadedUrl = new URL(asset.browser_download_url);
    assert.equal(uploadedUrl.origin, url.origin, "Asset must use the official GitHub host");
    assert.equal(uploadedUrl.search + uploadedUrl.hash, "", "Asset URL cannot contain query or fragment");
    const uploadedPath = decodeURIComponent(uploadedUrl.pathname);
    const draftPrefix = `/${repository}/releases/download/untagged-`;
    const draftSuffix = `/${filename}`;
    const isDraftAsset = uploadedPath.startsWith(draftPrefix) && uploadedPath.endsWith(draftSuffix)
      && !uploadedPath.slice(draftPrefix.length, -draftSuffix.length).includes("/");
    assert(
      uploadedPath === decodeURIComponent(url.pathname) || isDraftAsset,
      "Updater URL differs from its uploaded asset",
    );
    assert(assets.get(`${filename}.sig`)?.size > 0, `Missing signature asset: ${platform}`);
    assert(entry.signature?.trim(), `Missing updater signature: ${platform}`);
    assert.equal(
      entry.signature.trim(),
      signatures[`${filename}.sig`]?.trim(),
      "Manifest signature differs from its uploaded signature",
    );
    payloads.add(filename);
  }
  return [...payloads];
}

function main() {
  const [directory, repository, version, tag] = process.argv.slice(2);
  assert(
    directory && repository && version && tag,
    "Usage: check-release-updater.mjs DIRECTORY OWNER/REPO VERSION TAG",
  );
  const release = JSON.parse(readFileSync(join(directory, "release.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(directory, "latest.json"), "utf8"));
  const signatures = Object.fromEntries(
    release.assets.filter(asset => asset.name.endsWith(".sig")).map(
      asset => [asset.name, readFileSync(join(directory, asset.name), "utf8")],
    ),
  );
  const notes = readReleaseNotes(version);
  const payloads = validateUpdaterRelease({ release, manifest, signatures, repository, version, tag, notes });
  const config = JSON.parse(
    readFileSync(new URL("../apps/desktop/src-tauri/tauri.conf.json", import.meta.url), "utf8"),
  );
  const keyPath = join(directory, "updater-public.key");
  writeFileSync(keyPath, Buffer.from(config.plugins.updater.pubkey, "base64"));
  for (const filename of payloads) {
    const signaturePath = join(directory, `${filename}.minisig`);
    writeFileSync(signaturePath, Buffer.from(signatures[`${filename}.sig`].trim(), "base64"));
    execFileSync("minisign", ["-Vm", join(directory, filename), "-p", keyPath, "-x", signaturePath], {
      stdio: "inherit",
    });
  }
  console.log(`Verified ${payloads.length} signed updater payloads for ${version}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
