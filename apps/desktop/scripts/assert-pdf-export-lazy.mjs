import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const outputDir = path.resolve(process.argv[2] ?? "dist");
const manifestPath = path.join(outputDir, ".vite", "manifest.json");

if (!fs.existsSync(manifestPath)) {
  throw new Error(`Vite manifest not found at ${manifestPath}; build with --manifest first.`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const entry = Object.entries(manifest).find(([, record]) => record.isEntry && record.src === "index.html");

if (!entry) {
  throw new Error("Could not find the index.html entry in the Vite manifest.");
}

const [entryKey] = entry;
const staticFiles = new Set();
const allReachableKeys = new Set();

const visitStatic = key => {
  if (staticFiles.has(key)) {
    return;
  }

  staticFiles.add(key);
  for (const importedKey of manifest[key]?.imports ?? []) {
    visitStatic(importedKey);
  }
};

const visitAll = key => {
  if (allReachableKeys.has(key)) {
    return;
  }

  allReachableKeys.add(key);
  const record = manifest[key];
  for (const importedKey of [...(record?.imports ?? []), ...(record?.dynamicImports ?? [])]) {
    visitAll(importedKey);
  }
};

visitStatic(entryKey);
visitAll(entryKey);

const pdfEntries = Object.entries(manifest).filter(([key]) => /(^|[/_-])jspdf(?:[./_-]|$)/i.test(key));

if (pdfEntries.length === 0) {
  throw new Error("No separate jsPDF chunk found; PDF code may be back in the eager bundle.");
}

for (const [key, record] of pdfEntries) {
  if (staticFiles.has(key) || !record.isDynamicEntry || !allReachableKeys.has(key)) {
    throw new Error(`jsPDF is not deferred from the initial entry: ${key}`);
  }
}

console.log(`Verified ${pdfEntries.length} jsPDF chunk(s) are reachable only through dynamic imports from ${entryKey}.`);
