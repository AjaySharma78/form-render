#!/usr/bin/env node
/**
 * form-render CLI — scaffolds adapters into a consumer's project so they don't
 * copy template files by hand.
 *
 *   npx json-form-render add shadcn [--out <path>] [--force] [--no-deps] [--no-init]
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, "..");
const argv = process.argv.slice(2);

/** shadcn ui components the adapter imports (installed via `shadcn add`) */
const SHADCN_DEPS = [
  "input",
  "textarea",
  "checkbox",
  "switch",
  "select",
  "radio-group",
  "label",
  "button",
  "field",
  "popover",
  "command",
  "tooltip",
];

/** plain npm deps the templates import directly (not provided by us): the file
 * field's Dropzone (react-dropzone) and the icons used throughout (lucide-react,
 * which shadcn usually pulls in too — installed explicitly so --no-deps users
 * and minimal setups aren't left with missing imports). */
const NPM_DEPS = ["react-dropzone", "lucide-react"];

const log = (m = "") => process.stdout.write(m + "\n");
const errl = (m) => process.stderr.write(m + "\n");

/** This package's real published name (so a rename flows into scaffolded imports). */
function selfName() {
  try {
    return JSON.parse(readFileSync(join(PKG_ROOT, "package.json"), "utf8")).name ?? "json-form-render";
  } catch {
    return "json-form-render";
  }
}

function flag(name) {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

/** Choose the right "download & execute" runner for the project's package manager. */
function dlx() {
  const has = (f) => existsSync(resolve(process.cwd(), f));
  if (has("bun.lockb") || has("bun.lock")) return "bunx";
  if (has("pnpm-lock.yaml")) return "pnpm dlx";
  if (has("yarn.lock") && has(".yarnrc.yml")) return "yarn dlx"; // berry only
  return "npx"; // npm + yarn classic
}

function run(cmd) {
  return spawnSync(cmd, { stdio: "inherit", shell: true, cwd: process.cwd() }).status === 0;
}

/** Install command for the project's package manager (for plain npm deps). */
function pmAdd() {
  const has = (f) => existsSync(resolve(process.cwd(), f));
  if (has("bun.lockb") || has("bun.lock")) return "bun add";
  if (has("pnpm-lock.yaml")) return "pnpm add";
  if (has("yarn.lock")) return "yarn add";
  return "npm install";
}

/** Best-effort filesystem dir for a "@/..." ui alias (shadcn's common src mapping). */
function aliasToDir(alias) {
  if (alias.startsWith("@/") || alias.startsWith("~/")) return join("src", alias.slice(2));
  return alias;
}

/** Strip the @ts-nocheck banner + leading JSDoc and apply alias rewrites to a template. */
function prepTemplate(tpl, ui, utils) {
  tpl = tpl.replace(/^\/\/ @ts-nocheck[^\n]*\n(?:\/\/[^\n]*\n)*/, "");
  if (ui !== "@/components/ui") tpl = tpl.split("@/components/ui").join(ui);
  if (utils !== "@/lib/utils") tpl = tpl.split("@/lib/utils").join(utils);
  return tpl;
}

/**
 * Copy templates/dropzone.tsx into the consumer's ui folder (the file field
 * imports it from "<ui>/dropzone"). Best-effort path; logs where it landed.
 */
function scaffoldDropzone(ui, utils) {
  let tpl;
  try {
    tpl = readFileSync(join(PKG_ROOT, "templates", "dropzone.tsx"), "utf8");
  } catch {
    log("⚠ Could not locate templates/dropzone.tsx — copy it into <ui>/dropzone.tsx by hand.");
    return;
  }
  const dest = resolve(process.cwd(), aliasToDir(ui), "dropzone.tsx");
  if (existsSync(dest) && !argv.includes("--force")) {
    log(`• ${relative(process.cwd(), dest)} exists — left as-is (use --force to overwrite).`);
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, prepTemplate(tpl, ui, utils));
  log(`✔ Created ${relative(process.cwd(), dest)}`);
}

function readComponentsJson() {
  const cj = resolve(process.cwd(), "components.json");
  if (!existsSync(cj)) return null;
  try {
    return JSON.parse(readFileSync(cj, "utf8"));
  } catch {
    return null;
  }
}

function detectAliases(cj) {
  return {
    ui: cj?.aliases?.ui ?? "@/components/ui",
    utils: cj?.aliases?.utils ?? "@/lib/utils",
  };
}

/** Ensure shadcn is initialized; offer to init when interactive. Returns true if ready. */
function ensureInit() {
  if (readComponentsJson()) return true;

  const initCmd = `${dlx()} shadcn@latest init`;
  if (argv.includes("--no-init") || argv.includes("--no-deps")) {
    log(`⚠ shadcn isn't initialized (no components.json). Run:\n   ${initCmd}`);
    return false;
  }
  if (!process.stdout.isTTY) {
    // never hang a non-interactive shell (CI) on init prompts
    log(`⚠ shadcn isn't initialized (no components.json). Run:\n   ${initCmd}`);
    return false;
  }
  log("shadcn isn't initialized in this project. Running init…\n");
  run(initCmd);
  if (!readComponentsJson()) {
    log(`⚠ init didn't complete. Re-run after:\n   ${initCmd}`);
    return false;
  }
  return true;
}

function installDeps() {
  const addShadcn = `${dlx()} shadcn@latest add ${SHADCN_DEPS.join(" ")}`;
  const addNpm = `${pmAdd()} ${NPM_DEPS.join(" ")}`;
  if (argv.includes("--no-deps")) {
    log(`Skipped dependencies (--no-deps). Install them with:\n   ${addShadcn}\n   ${addNpm}`);
    return;
  }
  log(`Installing shadcn components: ${SHADCN_DEPS.join(", ")} …`);
  // single command string (fixed component list) avoids Node DEP0190
  if (!run(`${dlx()} shadcn@latest add ${SHADCN_DEPS.join(" ")} --yes`)) {
    log(`⚠ Could not add components automatically. Run manually:\n   ${addShadcn}`);
  }
  // templates import these directly (file-field Dropzone + icons)
  log(`Installing ${NPM_DEPS.join(" + ")} …`);
  if (!run(addNpm)) {
    log(`⚠ Could not install npm deps. Run manually:\n   ${addNpm}`);
  }
}

function importSpecifier(target) {
  // best-effort import path for the scaffolded file (printed hint only)
  return "./" + target.replace(/^src\//, "").replace(/\.(t|j)sx?$/, "");
}

function addShadcn() {
  const name = selfName();
  const target = flag("--out") ?? "src/lib/form-render-shadcn.tsx";
  const dest = isAbsolute(target) ? target : resolve(process.cwd(), target);

  if (existsSync(dest) && !argv.includes("--force")) {
    errl(`✖ ${target} already exists. Re-run with --force to overwrite.`);
    process.exit(1);
  }

  const ready = ensureInit();

  // read + transform the template
  let tpl;
  try {
    tpl = readFileSync(join(PKG_ROOT, "templates", "shadcn-adapter.tsx"), "utf8");
  } catch {
    errl("✖ Could not locate the bundled template (templates/shadcn-adapter.tsx).");
    process.exit(1);
  }
  tpl = tpl.replace(/^\/\/ @ts-nocheck[^\n]*\n(?:\/\/[^\n]*\n)*/, ""); // drop @ts-nocheck banner
  tpl = tpl.replace(
    /^\/\*\*[\s\S]*?\*\/\n/,
    `/* shadcn adapter for ${name} — generated by \`form-render add shadcn\`.\n` +
      " * Exports: shadcnComponents (controls), shadcnSlots (layout + buttons + field chrome). */\n",
  );
  if (name !== "json-form-render") tpl = tpl.split("json-form-render").join(name);

  const { ui, utils } = detectAliases(readComponentsJson());
  if (ui !== "@/components/ui") tpl = tpl.split("@/components/ui").join(ui);
  if (utils !== "@/lib/utils") tpl = tpl.split("@/lib/utils").join(utils);

  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, tpl);
  log(`✔ Created ${relative(process.cwd(), dest)}`);

  // the file field imports a Dropzone from "<ui>/dropzone"; scaffold it too
  scaffoldDropzone(ui, utils);
  log("");

  if (ready) installDeps();
  else
    log(
      `Skipped deps — initialize shadcn first, then:\n   ${dlx()} shadcn@latest add ${SHADCN_DEPS.join(" ")}\n   ${pmAdd()} ${NPM_DEPS.join(" ")}`,
    );

  // make the "what you need" picture explicit — these are NOT installed by `npm i`
  log("");
  log("Requirements for the shadcn path (things this package does not bundle):");
  log("   • Tailwind CSS + shadcn set up in your app (components.json) — `shadcn init` handles this.");
  log(`   • shadcn UI components: ${SHADCN_DEPS.join(", ")} (installed above via \`shadcn add\`).`);
  log(`   • npm deps: ${NPM_DEPS.join(", ")} (installed above).`);
  log(`   • peers (install if your app doesn't have them): react react-dom react-hook-form zod @hookform/resolvers`);

  log("");
  log("Use it:");
  log(`   import { FormRender } from "${name}";`);
  log(`   import { shadcnComponents, shadcnSlots } from "${importSpecifier(target)}";`);
  log("   <FormRender schema={schema} components={shadcnComponents} slots={shadcnSlots} onSubmit={save} />");
}

function help() {
  const name = selfName();
  log(`${name} — scaffolding CLI\n`);
  log("Usage:");
  log(`  npx ${name} add shadcn [options]`);
  log("      Scaffold the shadcn adapter (components + slots) + the file-field");
  log("      Dropzone, then install the shadcn UI components + react-dropzone +");
  log("      lucide-react. Requires Tailwind + shadcn (offers `shadcn init`).\n");
  log("Options:");
  log("  --out <path>   Destination file (default: src/lib/form-render-shadcn.tsx)");
  log("  --force        Overwrite the adapter / dropzone if they already exist");
  log("  --no-deps      Don't run `shadcn add` or install react-dropzone/lucide-react");
  log("  --no-init      Don't offer to run `shadcn init` when uninitialized");
  log("  -h, --help     Show this help");
}

const [cmd, sub] = argv;
if (argv.includes("-h") || argv.includes("--help")) help();
else if (cmd === "add" && sub === "shadcn") addShadcn();
else help();
