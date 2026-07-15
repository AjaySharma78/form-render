#!/usr/bin/env node
/**
 * Generate the official JSON Schema for FormSchema (published as
 * schema-form-engine/schema.json and used by editors via "$schema").
 *
 * ts-json-schema-generator expands React.CSSProperties into ~600 defs; we
 * replace Field.style with a plain-object schema and garbage-collect
 * definitions unreachable from the root afterwards.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const OUT = "schema.json";

execSync(
  `npx ts-json-schema-generator --path src/types.ts --type FormSchema --tsconfig tsconfig.json --no-type-check --out ${OUT}`,
  { stdio: "inherit" },
);

const schema = JSON.parse(readFileSync(OUT, "utf8"));

// 1. simplify Field.style — inline CSS is a runtime concern, not authorable contract
const field = schema.definitions?.Field;
if (field?.properties?.style) {
  field.properties.style = {
    type: "object",
    description: "Inline CSS properties applied to the field wrapper (React.CSSProperties).",
  };
}

// 2. garbage-collect definitions no longer referenced from the root
const used = new Set();
const walk = (node) => {
  if (Array.isArray(node)) return node.forEach(walk);
  if (node && typeof node === "object") {
    if (typeof node.$ref === "string") {
      const name = decodeURIComponent(node.$ref.replace("#/definitions/", ""));
      if (!used.has(name)) {
        used.add(name);
        walk(schema.definitions[name]);
      }
    }
    Object.values(node).forEach(walk);
  }
};
walk({ $ref: schema.$ref });
schema.definitions = Object.fromEntries(
  Object.entries(schema.definitions).filter(([k]) => used.has(k)),
);

schema.title = "schema-form-engine FormSchema";
schema.description =
  "Declarative JSON form schema for schema-form-engine — fields, layout, conditions, validation, arrays, computed values, and multi-step wizards.";

writeFileSync(OUT, JSON.stringify(schema, null, 2) + "\n");
console.log(`✔ ${OUT}: ${Object.keys(schema.definitions).length} definitions`);
