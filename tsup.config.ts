import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "adapters/html": "src/adapters/html.tsx",
    // expose the shared types as a named chunk so generated .d.ts files import
    // from "./types" instead of an auto-named hashed chunk (types-XXXX).
    types: "src/types.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ["react", "react-dom", "react-hook-form", "zod", "@hookform/resolvers"],
});
