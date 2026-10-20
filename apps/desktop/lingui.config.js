import { defineConfig } from "@lingui/cli";

export default defineConfig({
  sourceLocale: "en",
  locales: ["es", "en"],
  catalogs: [
    {
      path: "<rootDir>/src/locales/{locale}/messages",
      include: [
        "<rootDir>/src",
        "<rootDir>/../../packages/ui/src",
        "<rootDir>/../../packages/utils/src",
        "<rootDir>/../../packages/tiptap/src",
      ],
      exclude: ["**/node_modules/**", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "<rootDir>/src/locales/**"],
    },
  ],
});
