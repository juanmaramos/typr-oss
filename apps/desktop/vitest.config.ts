import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config";

export default defineConfig(async (env) =>
  mergeConfig(await viteConfig(env), {
    test: {
      server: {
        // BubbleMenu's ESM import needs Vite's CJS interop for tippy in Node tests.
        deps: { inline: ["@tiptap/react", "@tiptap/extension-bubble-menu", "tippy.js"] },
      },
    },
  })
);
