#!/usr/bin/env node
/**
 * form-render CLI.
 *
 *   npx schema-form-engine add shadcn [--out <path>] [--force] [--no-deps] [--no-init]
 *   npx schema-form-engine validate <schema.json>
 *   npx schema-form-engine generate "<description>" [--out form.json] [--provider anthropic|openai] [--model <id>] [--image <path>]
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
  "calendar", // date/datetime/month pickers (pulls react-day-picker)
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
    return JSON.parse(readFileSync(join(PKG_ROOT, "package.json"), "utf8")).name ?? "schema-form-engine";
  } catch {
    return "schema-form-engine";
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
  if (name !== "schema-form-engine") tpl = tpl.split("schema-form-engine").join(name);

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

/** Simple adapters (mui/antd): copy the template, print the deps to install. */
const SIMPLE_ADAPTERS = {
  mui: {
    template: "mui-adapter.tsx",
    defaultOut: "src/lib/form-render-mui.tsx",
    deps: ["@mui/material", "@emotion/react", "@emotion/styled"],
    exports: "muiComponents, muiSlots",
  },
  antd: {
    template: "antd-adapter.tsx",
    defaultOut: "src/lib/form-render-antd.tsx",
    deps: ["antd"],
    exports: "antdComponents, antdSlots",
  },
};

function addSimpleAdapter(kind) {
  const spec = SIMPLE_ADAPTERS[kind];
  const name = selfName();
  const target = flag("--out") ?? spec.defaultOut;
  const dest = isAbsolute(target) ? target : resolve(process.cwd(), target);

  if (existsSync(dest) && !argv.includes("--force")) {
    errl(`✖ ${target} already exists. Re-run with --force to overwrite.`);
    process.exit(1);
  }
  let tpl;
  try {
    tpl = readFileSync(join(PKG_ROOT, "templates", spec.template), "utf8");
  } catch {
    errl(`✖ Could not locate the bundled template (templates/${spec.template}).`);
    process.exit(1);
  }
  tpl = tpl.replace(/^\/\/ @ts-nocheck[^\n]*\n/, "");
  if (name !== "schema-form-engine") tpl = tpl.split("schema-form-engine").join(name);

  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, tpl);
  log(`✔ Created ${relative(process.cwd(), dest)}`);

  if (argv.includes("--no-deps")) {
    log(`Skipped dependencies (--no-deps). Install with:\n   ${pmAdd()} ${spec.deps.join(" ")}`);
  } else {
    log(`Installing ${spec.deps.join(" + ")} …`);
    if (!run(`${pmAdd()} ${spec.deps.join(" ")}`)) {
      log(`⚠ Could not install automatically. Run manually:\n   ${pmAdd()} ${spec.deps.join(" ")}`);
    }
  }

  log("");
  log("Use it:");
  log(`   import { FormRender } from "${name}";`);
  log(`   import { ${spec.exports} } from "${importSpecifier(target)}";`);
  log(`   <FormRender schema={schema} components={${spec.exports.split(",")[0].trim()}} slots={${spec.exports.split(",")[1].trim()}} onSubmit={save} />`);
}

/** Import the built library (dist/) relative to this bin file. */
async function loadDist(subpath) {
  const p = join(PKG_ROOT, "dist", subpath);
  if (!existsSync(p)) {
    errl(`✖ ${relative(PKG_ROOT, p)} not found — run \`npm run build\` first (dev checkout).`);
    process.exit(1);
  }
  return import(pathToFileURL(p).href);
}

async function validateCmd(file) {
  if (!file) {
    errl("✖ Usage: validate <schema.json>");
    process.exit(1);
  }
  const path = isAbsolute(file) ? file : resolve(process.cwd(), file);
  if (!existsSync(path)) {
    errl(`✖ File not found: ${file}`);
    process.exit(1);
  }
  let schema;
  try {
    schema = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    errl(`✖ ${file} is not valid JSON: ${e.message}`);
    process.exit(1);
  }
  const { validateSchema } = await loadDist("index.js");
  try {
    validateSchema(schema);
  } catch (e) {
    errl(`✖ Invalid schema:\n${e.message}`);
    process.exit(1);
  }
  const fieldCount =
    (schema.fields?.length ?? 0) +
    (schema.steps ?? []).reduce((n, s) => n + (s.fields?.length ?? 0), 0);
  log(`✔ ${file} is a valid FormSchema (id "${schema.id}", ${fieldCount} fields).`);
}

const IMAGE_TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };

const PROVIDER_KEYS = {
  anthropic: ["ANTHROPIC_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  google: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
};

function detectProvider() {
  const explicit = flag("--provider");
  if (explicit) return explicit;
  for (const [provider, envs] of Object.entries(PROVIDER_KEYS)) {
    if (envs.some((e) => process.env[e])) return provider;
  }
  return "anthropic";
}

async function generateCmd(description) {
  if (!description || description.startsWith("--")) {
    errl('✖ Usage: generate "<description>" [--out form.json] [--provider anthropic|openai|google] [--model <id>] [--image <path>]');
    process.exit(1);
  }
  const provider = detectProvider();
  const envs = PROVIDER_KEYS[provider];
  if (!envs) {
    errl(`✖ Unknown provider "${provider}" — use anthropic, openai, or google.`);
    process.exit(1);
  }
  const apiKey = envs.map((e) => process.env[e]).find(Boolean);
  if (!apiKey) {
    errl(`✖ Set ${envs.join(" or ")} in the environment.`);
    process.exit(1);
  }

  let image;
  const imagePath = flag("--image");
  if (imagePath) {
    const mediaType = IMAGE_TYPES[extname(imagePath).toLowerCase()];
    if (!mediaType) {
      errl(`✖ Unsupported image type: ${imagePath} (png/jpg/webp/gif)`);
      process.exit(1);
    }
    image = { base64: readFileSync(resolve(process.cwd(), imagePath)).toString("base64"), mediaType };
  }

  const { generateFormSchema } = await loadDist("ai/index.js");
  log(`Generating with ${provider}${flag("--model") ? ` (${flag("--model")})` : ""} …`);
  try {
    const { schema, repaired } = await generateFormSchema({
      prompt: description,
      provider,
      apiKey,
      model: flag("--model"),
      image,
    });
    const out = flag("--out") ?? "form.json";
    const dest = isAbsolute(out) ? out : resolve(process.cwd(), out);
    const withPragma = { $schema: "https://schema-form-engine.vercel.app/schema.json", ...schema };
    writeFileSync(dest, JSON.stringify(withPragma, null, 2) + "\n");
    log(`✔ Wrote ${relative(process.cwd(), dest)}${repaired ? " (repaired after one validation round)" : ""}`);
  } catch (e) {
    errl(`✖ Generation failed: ${e.message}`);
    process.exit(1);
  }
}

function help() {
  const name = selfName();
  log(`${name} — CLI\n`);
  log("Usage:");
  log(`  npx ${name} add shadcn [options]`);
  log("      Scaffold the shadcn adapter (components + slots) + the file-field");
  log("      Dropzone, then install the shadcn UI components + react-dropzone +");
  log("      lucide-react. Requires Tailwind + shadcn (offers `shadcn init`).\n");
  log(`  npx ${name} add mui | antd [--out <path>] [--force] [--no-deps]`);
  log("      Scaffold the Material UI / Ant Design adapter and install its deps.\n");
  log(`  npx ${name} validate <schema.json>`);
  log("      Check a form schema (structure, refs, cycles) and exit non-zero on problems.\n");
  log(`  npx ${name} generate "<description>" [--out form.json] [--provider anthropic|openai|google] [--model <id>] [--image <path>]`);
  log("      Generate a validated schema with AI (needs ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY).\n");
  log("Options (add shadcn):");
  log("  --out <path>   Destination file (default: src/lib/form-render-shadcn.tsx)");
  log("  --force        Overwrite the adapter / dropzone if they already exist");
  log("  --no-deps      Don't run `shadcn add` or install react-dropzone/lucide-react");
  log("  --no-init      Don't offer to run `shadcn init` when uninitialized");
  log("  -h, --help     Show this help");
}

const [cmd, sub] = argv;
if (argv.includes("-h") || argv.includes("--help")) help();
else if (cmd === "add" && sub === "shadcn") addShadcn();
else if (cmd === "add" && SIMPLE_ADAPTERS[sub]) addSimpleAdapter(sub);
else if (cmd === "validate") await validateCmd(sub);
else if (cmd === "generate") await generateCmd(sub);
else help();
