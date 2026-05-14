import { defineConfig } from "@lingui/cli";

export default defineConfig({
  sourceLocale: "en",
  locales: ["es", "en"],
  catalogs: [
    {
      path: "<rootDir>/src/locales/{locale}/messages",
      include: ["<rootDir>/src", "../../packages/utils/src", "../../packages/tiptap/src"],
      exclude: ["**/node_modules/**", "<rootDir>/src/locales/**"],
    },
  ],
});
