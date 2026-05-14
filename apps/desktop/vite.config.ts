import fs from "fs";
import path from "path";

import { lingui } from "@lingui/vite-plugin";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type UserConfig } from "vite";
import { DynamicPublicDirectory } from "vite-multiple-assets";

const host = process.env.TAURI_DEV_HOST || "127.0.0.1";
const workspaceRoot = path.resolve(__dirname, "../../");
const workspaceRealRoot = fs.realpathSync(workspaceRoot);
const nodeModulesRoot = fs.realpathSync(path.resolve(__dirname, "../../node_modules"));
const repoRoot = path.dirname(nodeModulesRoot);
const shouldUploadSentrySourcemaps = Boolean(
  process.env.SENTRY_AUTH_TOKEN
    && process.env.SENTRY_ORG
    && process.env.SENTRY_PROJECT
    && process.env.VITE_SENTRY_RELEASE,
);

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  resolve: {
    alias: [
      {
        find: "@typr/ui/globals.css",
        replacement: path.resolve(__dirname, "../../packages/ui/src/styles/globals.css"),
      },
      {
        find: "@typr/ui",
        replacement: path.resolve(__dirname, "../../packages/ui/src"),
      },
      {
        find: "@typr/tiptap",
        replacement: path.resolve(__dirname, "../../packages/tiptap/src"),
      },
      {
        find: "@typr/plugin-db",
        replacement: path.resolve(__dirname, "../../plugins/db/js"),
      },
      {
        find: "@",
        replacement: path.resolve(__dirname, "./src"),
      },
    ],
  },
  publicDir: "",
  plugins: [
    DynamicPublicDirectory(["public/**/*"], { cwd: __dirname }),
    DynamicPublicDirectory(
      [
        {
          input: "*/assets/**/*",
          output: "/assets",
          flatten: true,
        },
      ],
      {
        cwd: path.resolve(__dirname, "../../extensions"),
      },
    ),
    lingui(),
    TanStackRouterVite({ target: "react", autoCodeSplitting: false }),
    react({
      babel: {
        plugins: ["@lingui/babel-plugin-lingui-macro"],
      },
    }),
    shouldUploadSentrySourcemaps
      && sentryVitePlugin({
        authToken: process.env.SENTRY_AUTH_TOKEN,
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        telemetry: false,
        release: {
          name: process.env.VITE_SENTRY_RELEASE,
          setCommits: {
            auto: true,
          },
        },
        sourcemaps: {
          assets: "./dist/**",
          filesToDeleteAfterUpload: ["./dist/**/*.map"],
        },
      }),
  ],
  ...tauri,
}));

// https://v2.tauri.app/start/frontend/vite/#update-vite-configuration
const tauri: UserConfig = {
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host,
    fs: {
      allow: [workspaceRoot, workspaceRealRoot, repoRoot, nodeModulesRoot],
    },
    hmr: host
      ? {
        protocol: "ws",
        host,
        port: 1421,
      }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  envDir: path.resolve(__dirname, "../../"), // Load .env from project root
  build: {
    outDir: "./dist",
    chunkSizeWarningLimit: 500 * 10,
    target: process.env.TAURI_ENV_PLATFORM == "windows" ? "chrome105" : "safari13",
    // minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    minify: false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG || shouldUploadSentrySourcemaps,
  },
};
