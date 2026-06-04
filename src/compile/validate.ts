import type { Condition, FormSchema, Visibility } from "../types";
import { extractDeps } from "../engine/condition";
import { allDeclaredFields, allFields } from "./schema-utils";

/**
 * Dev-time sanity check on the schema itself: duplicate names and conditions /
 * rules that reference unknown fields. Throws with all problems collected.
 * Call once (e.g. in dev) — it does not run validation on values.
 */
export function validateSchema(schema: FormSchema): void {
  const errors: string[] = [];
  const names = allDeclaredFields(schema).map((f) => f.name);
  const known = new Set(allFields(schema).map((f) => f.name));

  const seen = new Set<string>();
  for (const n of names) {
    if (seen.has(n)) errors.push(`Duplicate field name: "${n}".`);
    seen.add(n);
  }

  const checkRef = (field: string, ctx: string) => {
    if (!known.has(field)) errors.push(`${ctx} references unknown field "${field}".`);
  };
  const checkVisibility = (rule: Visibility | Condition | undefined, ctx: string) => {
    for (const dep of extractDeps(rule)) checkRef(dep, ctx);
  };

  for (const f of allDeclaredFields(schema)) {
    checkVisibility(f.visibleWhen, `Field "${f.name}".visibleWhen`);
    checkVisibility(f.requiredWhen, `Field "${f.name}".requiredWhen`);
    checkVisibility(f.disabledWhen, `Field "${f.name}".disabledWhen`);
  }
  for (const r of schema.rules ?? []) {
    if ("fields" in r) r.fields.forEach((fn) => checkRef(fn, `Rule "${r.type}"`));
    if ("field" in r) checkRef(r.field, `Rule "${r.type}"`);
    if ("when" in r) checkVisibility(r.when, `Rule "${r.type}".when`);
  }

  if (errors.length) {
    throw new Error(`[form-render] Invalid schema "${schema.id}":\n - ${errors.join("\n - ")}`);
  }
}
