# Desktop performance measurements

## PDF export loading

The note-header share menu statically imported `pdf-export.ts`, which brought jsPDF into the desktop entry even when users never exported a PDF. `exportToPDF` now loads jsPDF only when invoked and starts that import alongside the existing session metadata reads.

The production bundle comparison used baseline revision `a1dfb5f016fa31d1044663d5900f0ea4e1fc5306` and the same tree with the lazy import change. Environment: macOS 27.0 arm64, Node v25.6.0, Vite 5.4.21. Both builds transformed 11,860 modules; Vite's existing `minify: false` setting was unchanged.

| Eager JavaScript in the `index.html` static import closure | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Raw bytes | 7,401,077 | 6,800,593 | 600,484 (8.1%) |
| Gzip bytes | 1,540,960 | 1,390,514 | 150,446 (9.8%) |

The manifest's eager JavaScript closure contains only the `index.html` entry in both builds. The emitted jsPDF chunk is 596,773 raw bytes (149,040 gzip bytes) and is now a dynamic entry. The small difference between the chunk size and eager-entry reduction comes from the generated import wrapper and bundler output. These raw counts use actual output file bytes; Vite's printed raw `kB` display counts JavaScript string units and is lower for these bundles because they contain multi-byte text.

To repeat the graph assertion against the default `dist` directory from `apps/desktop`, run:

```sh
./node_modules/.bin/vite build --manifest
pnpm perf:assert-pdf-export-lazy
```

For a before/after comparison, run that build once at the baseline revision and once with the change, using distinct output directories, then pass each directory to `node scripts/assert-pdf-export-lazy.mjs <output-dir>`. Read the `index.html` entry's `file` from `.vite/manifest.json`; count raw bytes with `wc -c < "$ENTRY_FILE"` and gzip bytes with `gzip -c < "$ENTRY_FILE" | wc -c`. The assertion fails if jsPDF enters the entry's static import closure or stops being reachable through a dynamic import.

The bundle measurement demonstrates less eager JavaScript in the desktop webview. It does not measure app-ready time, JavaScript parse/evaluation time, or PDF export latency. A synthetic jsdom test exercises the real jsPDF implementation and confirms the generated PDF contains the session title, event, participant, and note content before it is written to the mocked app-data path.

Further work should first measure time to a ready note and first typing interaction. Session read coalescing and transcript rendering are worth revisiting if those journey traces show repeated reads or editor jank.
