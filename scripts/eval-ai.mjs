#!/usr/bin/env node
/**
 * AI generation eval — runs 20 realistic prompts against a live provider and
 * reports first-pass validity + post-repair validity (PRD target: ≥90% / 100%).
 * Needs a built dist/ and an API key; not part of CI.
 *
 *   ANTHROPIC_API_KEY=… node scripts/eval-ai.mjs [--provider openai] [--model <id>]
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { generateFormSchema } = await import(pathToFileURL(join(ROOT, "dist", "ai", "index.js")).href);

const argv = process.argv.slice(2);
const flag = (n) => (argv.indexOf(n) === -1 ? undefined : argv[argv.indexOf(n) + 1]);
const provider = flag("--provider") ?? "anthropic";
const apiKey = provider === "openai" ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error(`Set ${provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"}.`);
  process.exit(1);
}

const PROMPTS = [
  "a newsletter signup with email and a consent checkbox",
  "a contact form: name, email, subject dropdown (support/sales/other), message",
  "a login form with email, password, and remember-me",
  "a signup form with email, password and confirmation that must match",
  "a job application: personal details, repeatable work experience (company, role, years), resume upload pdf max 5MB",
  "an event registration with ticket type (standard/vip), quantity 1-10, and dietary requirements shown only for vip",
  "a shipping address form; show a state dropdown only when country is US",
  "a 3-step onboarding wizard: account, profile, preferences, ending with a review step",
  "an insurance quote: age, smoker toggle, and if smoker ask years smoked (required)",
  "a survey: satisfaction 1-10 range, what went wrong textarea shown when rating below 5",
  "an invoice with repeatable line items (description, qty, unit price) and min 1 item",
  "a team invite form with a repeatable list of email addresses, max 5",
  "a booking form where checkout date must be after checkin date",
  "a profile form with username (async availability check mentioned as server check), bio max 200 chars",
  "a support ticket: category select, priority radio, description required min 30 chars, attachments up to 3 files",
  "a US phone contact form with a masked phone number input",
  "a medical intake form split into sections: patient info, insurance (collapsible), emergency contacts (repeatable, 1-3)",
  "a product review form: rating radio 1-5, title, review textarea, would-recommend switch",
  "a loan application wizard: applicant, employment (self-employed reveals business fields), amounts, review step",
  "a conference talk submission: title, abstract 100-2000 chars, track select, co-speakers repeatable max 2, slides url",
];

let firstPass = 0;
let afterRepair = 0;
const failures = [];

for (const [i, prompt] of PROMPTS.entries()) {
  process.stdout.write(`[${String(i + 1).padStart(2)}/${PROMPTS.length}] ${prompt.slice(0, 60)}… `);
  try {
    const { repaired } = await generateFormSchema({ prompt, provider, apiKey, model: flag("--model") });
    afterRepair++;
    if (!repaired) firstPass++;
    console.log(repaired ? "✔ (repaired)" : "✔");
  } catch (e) {
    failures.push({ prompt, error: e.message.split("\n")[0] });
    console.log("✖");
  }
}

console.log(`\nfirst-pass valid : ${firstPass}/${PROMPTS.length} (${Math.round((firstPass / PROMPTS.length) * 100)}%)`);
console.log(`valid after repair: ${afterRepair}/${PROMPTS.length} (${Math.round((afterRepair / PROMPTS.length) * 100)}%)`);
for (const f of failures) console.log(`  ✖ ${f.prompt}\n    ${f.error}`);
process.exit(afterRepair === PROMPTS.length ? 0 : 1);
