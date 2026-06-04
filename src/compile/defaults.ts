import type { Field, FormSchema, FormValues } from "../types";
import { allFields, isArrayValued } from "./schema-utils";

/** Type-correct empty value for a field that has no explicit `default`. */
function emptyFor(field: Field): unknown {
  if (isArrayValued(field)) return [];
  switch (field.type) {
    case "checkbox":
    case "switch":
      return false;
    case "number":
    case "range":
    case "file":
      return undefined;
    default:
      return "";
  }
}

/**
 * Build RHF defaultValues for EVERY field (incl. conditional/hidden ones) so
 * inputs stay controlled and useWatch never returns undefined. `overrides`
 * (e.g. edit-mode prefill) win.
 */
export function buildDefaults(schema: FormSchema, overrides: FormValues = {}): FormValues {
  const out: FormValues = {};
  for (const f of allFields(schema)) {
    out[f.name] = f.default ?? emptyFor(f);
  }
  return { ...out, ...overrides };
}
