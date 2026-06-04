import type { Field, FormSchema, Step } from "../types";

/** All steps as an array (single-page schemas are normalized to one synthetic step). */
export function getSteps(schema: FormSchema): Step[] {
  if (schema.steps && schema.steps.length > 0) return schema.steps;
  return [
    {
      id: schema.id,
      title: schema.title ?? schema.id,
      fields: schema.fields ?? [],
      sections: schema.sections,
      layout: schema.layout,
    },
  ];
}

/** Every value/data field across all steps (excludes action controls). */
export function allFields(schema: FormSchema): Field[] {
  return getSteps(schema).flatMap((s) => s.fields).filter((f) => !isActionField(f));
}

/** Action + value fields (everything authored), across steps + top-level actions. */
export function allDeclaredFields(schema: FormSchema): Field[] {
  return [...getSteps(schema).flatMap((s) => s.fields), ...(schema.actions ?? [])];
}

const ACTION_TYPES = new Set(["button", "submit", "reset", "image"]);

export function isActionField(field: Field): boolean {
  return ACTION_TYPES.has(field.type);
}

/** True when a field holds an array value: `multiselect`, or `select` + `multiple`. */
export function isArrayValued(field: Field): boolean {
  return field.type === "multiselect" || (field.type === "select" && !!field.multiple);
}
