import { defineConfig } from "tsup";

// NOTE: no `treeshake` — tsup's rollup treeshake pass strips banners
// (and esbuild already tree-shakes; the package is small + sideEffects-flagged).
export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      "adapters/html": "src/adapters/html.tsx",
      // expose the shared types as a named chunk so generated .d.ts files import
      // from "./types" instead of an auto-named hashed chunk (types-XXXX).
      types: "src/types.ts",
    },
    format: ["esm", "cjs"],
    // everything here is client-side (hooks/components); the directive makes
    // imports work from Next.js App Router server components.
    banner: { js: '"use client";' },
    dts: true,
    sourcemap: true,
    // NOTE: no `clean` here — the two configs build in parallel, and a clean in
    // one races the other's output (it intermittently deleted dist/ai/*.d.ts).
    // The npm build script rimrafs dist/ up front instead.
    external: ["react", "react-dom", "react-hook-form", "zod", "@hookform/resolvers"],
  },
  {
    // server-safe subpath (plain fetch, no React) — must NOT carry "use client",
    // so generateFormSchema stays importable from server actions / Node scripts.
    entry: { "ai/index": "src/ai/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    external: ["react", "react-dom", "react-hook-form", "zod", "@hookform/resolvers"],
  },
]);
