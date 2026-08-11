import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", "v5/index": "src/v5/index.ts" },
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: "dist",
});
