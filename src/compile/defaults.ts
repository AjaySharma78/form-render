import type { Field, FormSchema, FormValues } from "../types";
import { setPath } from "../engine/path";
import { allFields, isActionField, isArrayValued } from "./schema-utils";

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

/** A field's initial value: explicit `default`, else defaultItems rows (arrays), else a typed empty. */
function defaultFor(field: Field): unknown {
  if (field.default !== undefined) return field.default;
  if (field.type === "array") {
    const count = field.defaultItems ?? 0;
    return Array.from({ length: count }, () => emptyRowFor(field));
  }
  return emptyFor(field);
}

/**
 * A fresh, fully-populated row for an array field — used for initial rows and
 * by the renderer's Add button (RHF needs every key present so row inputs stay
 * controlled). Recurses into nested arrays.
 */
export function emptyRowFor(field: Field): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const f of field.item?.fields ?? []) {
    if (isActionField(f)) continue;
    row[f.name] = defaultFor(f);
  }
  return row;
}

/**
 * Build RHF defaultValues for EVERY field (incl. conditional/hidden ones) so
 * inputs stay controlled and useWatch never returns undefined. `overrides`
 * (e.g. edit-mode prefill) win.
 */
export function buildDefaults(schema: FormSchema, overrides: FormValues = {}): FormValues {
  const out: FormValues = {};
  for (const f of allFields(schema)) {
    setPath(out, f.name, defaultFor(f));
  }
  return { ...out, ...overrides };
}
