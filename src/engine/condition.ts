import type { Condition, FieldRef, FormValues, Visibility } from "../types";
import { getPath } from "./path";

export function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function isFieldRef(x: unknown): x is FieldRef {
  return typeof x === "object" && x !== null && "$field" in x;
}

/** Evaluate a single leaf condition against the current form values. */
export function evaluateCondition(cond: Condition, values: FormValues): boolean {
  const v = getPath(values, cond.field);
  // a { $field } operand compares against another field's current value
  const resolve = (x: unknown): unknown => (isFieldRef(x) ? getPath(values, x.$field) : x);
  const cmp = (x: number | FieldRef, ok: (a: number, b: number) => boolean): boolean => {
    const b = resolve(x);
    return typeof v === "number" && typeof b === "number" && ok(v, b);
  };
  if ("is" in cond) return v === resolve(cond.is);
  if ("not" in cond) return v !== resolve(cond.not);
  if ("in" in cond) return cond.in.includes(v as string | number);
  if ("notEmpty" in cond) return !isEmpty(v);
  if ("isEmpty" in cond) return isEmpty(v);
  if ("matches" in cond) return typeof v === "string" && new RegExp(cond.matches).test(v);
  if ("contains" in cond) return Array.isArray(v) && v.includes(cond.contains);
  if ("containsAny" in cond)
    return Array.isArray(v) && cond.containsAny.some((x) => (v as unknown[]).includes(x));
  if ("gt" in cond) return cmp(cond.gt, (a, b) => a > b);
  if ("lt" in cond) return cmp(cond.lt, (a, b) => a < b);
  if ("gte" in cond) return cmp(cond.gte, (a, b) => a >= b);
  if ("lte" in cond) return cmp(cond.lte, (a, b) => a <= b);
  return true;
}

/** Evaluate a (possibly nested) visibility tree. Absent tree = visible. */
export function evaluateVisibility(rule: Visibility | undefined, values: FormValues): boolean {
  if (!rule) return true;
  if ("all" in rule) return rule.all.every((r) => evaluateVisibility(r, values));
  if ("any" in rule) return rule.any.some((r) => evaluateVisibility(r, values));
  return evaluateCondition(rule, values);
}

/**
 * Resolve a condition field reference against a row prefix. Inside an array
 * row, bare names address row siblings ("phone" → "contacts.2.phone") and a
 * "$." prefix escapes to the form root ("$.plan" → "plan"). Without a prefix,
 * "$." is simply stripped.
 */
export function rebasePath(path: string, prefix?: string): string {
  if (path.startsWith("$.")) return path.slice(2);
  return prefix ? `${prefix}.${path}` : path;
}

/**
 * Rewrite every leaf `field` (and `$field` operand) in a visibility tree to an
 * absolute root path. Returns the same reference when nothing changes.
 */
export function rebaseVisibility<V extends Visibility | undefined>(rule: V, prefix?: string): V {
  if (!rule) return rule;
  if ("all" in rule) {
    const all = rule.all.map((r) => rebaseVisibility(r, prefix));
    return (all.every((r, i) => r === rule.all[i]) ? rule : { all }) as V;
  }
  if ("any" in rule) {
    const any = rule.any.map((r) => rebaseVisibility(r, prefix));
    return (any.every((r, i) => r === rule.any[i]) ? rule : { any }) as V;
  }
  const field = rebasePath(rule.field, prefix);
  let out = rule as Condition;
  for (const key of ["is", "not", "gt", "lt", "gte", "lte"] as const) {
    const operand = (out as Record<string, unknown>)[key];
    if (isFieldRef(operand)) {
      const ref = rebasePath(operand.$field, prefix);
      if (ref !== operand.$field) out = { ...out, [key]: { $field: ref } } as Condition;
    }
  }
  if (field !== out.field) out = { ...out, field };
  return out as V;
}

/** Field names a condition/visibility tree depends on (for scoped subscriptions). */
export function extractDeps(rule: Visibility | Condition | undefined): string[] {
  if (!rule) return [];
  if ("all" in rule) return dedupe(rule.all.flatMap(extractDeps));
  if ("any" in rule) return dedupe(rule.any.flatMap(extractDeps));
  const deps = [rule.field];
  for (const operand of Object.values(rule)) {
    if (isFieldRef(operand)) deps.push(operand.$field);
  }
  return dedupe(deps);
}

function dedupe(xs: string[]): string[] {
  return Array.from(new Set(xs));
}
