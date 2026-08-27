import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", "v5/index": "src/v5/index.ts" },
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: "dist",
  // Bundle every runtime dependency into dist so the published package has
  // zero install-time requirements. Consumers that install with peer deps
  // disabled (legacy-peer-deps/omit=peer), and runtimes that install the
  // package dynamically (OpenCode's provider loader), otherwise fail with
  // "Cannot find module" before any request is made.
  noExternal: ["@ai-sdk/provider", "@ai-sdk/provider-utils", "zod"],
});
