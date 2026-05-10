import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

/**
 * `externalizeDepsPlugin` keeps third-party deps as runtime requires (so
 * better-sqlite3's native binding is loaded from node_modules at runtime).
 * The `exclude` list is for *workspace* packages — Vite bundles their TS
 * source directly into the main bundle so we don't need a build step.
 */
const externalize = externalizeDepsPlugin({
  exclude: ["@vibemaestro/core", "@vibemaestro/db", "@vibemaestro/pty-daemon"],
});

/**
 * Native and ESM-unfriendly transitive deps that the workspace packages pull
 * in. We MUST keep these external, otherwise Rollup inlines code that uses
 * `__filename` / `__dirname` at runtime and Electron blows up at first import.
 */
const NATIVE_DEPS = [
  "better-sqlite3",
  "drizzle-orm",
  /^drizzle-orm\//,
  "bindings",
  "node-gyp-build",
  "node-pty",
];

export default defineConfig({
  main: {
    plugins: [externalize],
    resolve: {
      alias: {
        "@vibemaestro/core": resolve(__dirname, "../../packages/core/src/index.ts"),
        "@vibemaestro/db": resolve(__dirname, "../../packages/db/src/index.ts"),
        "@vibemaestro/pty-daemon": resolve(__dirname, "../../packages/pty-daemon/src/index.ts"),
      },
    },
    build: {
      outDir: "out/main",
      rollupOptions: {
        external: NATIVE_DEPS,
        input: { index: resolve(__dirname, "src/main/index.ts") },
      },
    },
  },
  preload: {
    plugins: [externalize],
    build: {
      outDir: "out/preload",
      rollupOptions: {
        input: { index: resolve(__dirname, "src/preload/index.ts") },
        // Electron's `sandbox: true` requires CommonJS preload — sandboxed preloads
        // can't use ES modules (process.contextIsolated is true and `import` fails).
        output: {
          format: "cjs",
          entryFileNames: "[name].js",
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@vibemaestro/core": resolve(__dirname, "../../packages/core/src/index.ts"),
      },
    },
    build: {
      outDir: "out/renderer",
      rollupOptions: {
        input: { index: resolve(__dirname, "src/renderer/index.html") },
      },
    },
    server: {
      port: 5173,
    },
  },
});
