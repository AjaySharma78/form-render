import type { Field } from "../types";

/** Treat empty-ish input as undefined so optional/number schemas behave. */
export const emptyToUndefined = (v: unknown): unknown =>
  v === "" || v === null ? undefined : v;

const NUMERIC_TYPES = new Set(["number", "range"]);
const OPTION_TYPES = new Set(["select", "radio", "multiselect"]);

/** Match a control's string value back to the declared option, preserving its type. */
function toOptionValue(field: Field, value: unknown): unknown {
  const match = (field.options ?? []).find((o) => String(o.value) === String(value));
  return match ? match.value : value;
}

/**
 * Coerce a raw control value into the shape the field's Zod schema expects.
 * HTML inputs and option values are strings; numeric fields need numbers, and
 * choice fields with numeric option values submit numbers (not "1").
 *
 * Empty numerics stay as "" (not undefined): RHF reverts a Controller field to
 * its defaultValue when set to undefined, which would snap a cleared number
 * back to its default. The Zod schema preprocesses "" → undefined, so an empty
 * value still validates/serializes correctly.
 */
export function coerceByType(field: Field, value: unknown): unknown {
  if (NUMERIC_TYPES.has(field.type)) {
    if (value === "" || value === null || value === undefined) return "";
    const n = Number(value);
    return Number.isNaN(n) ? value : n;
  }
  if (OPTION_TYPES.has(field.type) && field.options?.length) {
    if (Array.isArray(value)) return value.map((v) => toOptionValue(field, v));
    if (value === "" || value === null || value === undefined) return value;
    return toOptionValue(field, value);
  }
  return value;
}
