import type { Field } from "../types";

/** Treat empty-ish input as undefined so optional/number schemas behave. */
export const emptyToUndefined = (v: unknown): unknown =>
  v === "" || v === null ? undefined : v;

const NUMERIC_TYPES = new Set(["number", "range"]);

/**
 * Coerce a raw control value into the shape the field's Zod schema expects.
 * HTML inputs and option values are strings; numeric fields need numbers.
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
  return value;
}
