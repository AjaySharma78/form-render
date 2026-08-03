#!/usr/bin/env node
/**
 * Adapter template compile harness.
 *
 * Copies templates/*.tsx into src/ (stripping the `// @ts-nocheck` banner the
 * CLI also strips at scaffold time), then typechecks the lot against the REAL
 * UI libraries and the built engine (../../dist). A template that doesn't
 * compile for consumers fails here first.
 *
 *   npm run check:adapters          (from the package root; builds dist first)
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const SRC = join(HERE, "src");

if (!existsSync(join(ROOT, "dist", "index.d.ts"))) {
  console.error("✖ dist/ not built — run `npm run build` first.");
  process.exit(1);
}

// self-install the harness deps on first run (kept out of the root node_modules)
if (!existsSync(join(HERE, "node_modules", "typescript"))) {
  console.log("Installing harness dependencies (first run)…");
  const install = spawnSync("npm", ["install", "--no-audit", "--no-fund"], {
    cwd: HERE,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (install.status !== 0) process.exit(install.status ?? 1);
}

rmSync(SRC, { recursive: true, force: true });
mkdirSync(SRC, { recursive: true });
const templates = readdirSync(join(ROOT, "templates")).filter((f) => f.endsWith(".tsx"));
for (const f of templates) {
  const body = readFileSync(join(ROOT, "templates", f), "utf8").replace(/^\/\/ @ts-nocheck[^\n]*\n/, "");
  writeFileSync(join(SRC, f), body);
}
console.log(`Typechecking ${templates.length} templates: ${templates.join(", ")}`);

const TSC = join(HERE, "node_modules", "typescript", "bin", "tsc");
const run = (project, label) => {
  console.log(`— ${label}`);
  return spawnSync(process.execPath, [TSC, "--noEmit", "-p", project], { stdio: "inherit" }).status ?? 1;
};

// fully-typed adapters (chakra/mantine/mui/antd) at full strictness…
const strict = run(join(HERE, "tsconfig.json"), "typed adapters (strict)");
// …shadcn+dropzone with wildcard-stubbed "@/components/ui/*" (noImplicitAny off)
const stubbed = run(join(HERE, "tsconfig.stubbed.json"), "shadcn template (ui stubs)");

if (strict === 0 && stubbed === 0) {
  console.log("✔ All adapter templates compile against their real UI libraries.");
  process.exit(0);
}
process.exit(1);
