import type { Condition, FormValues, Visibility } from "../types";

export function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Evaluate a single leaf condition against the current form values. */
export function evaluateCondition(cond: Condition, values: FormValues): boolean {
  const v = values[cond.field];
  if ("is" in cond) return v === cond.is;
  if ("not" in cond) return v !== cond.not;
  if ("in" in cond) return cond.in.includes(v as string | number);
  if ("notEmpty" in cond) return !isEmpty(v);
  if ("gt" in cond) return typeof v === "number" && v > cond.gt;
  if ("lt" in cond) return typeof v === "number" && v < cond.lt;
  if ("gte" in cond) return typeof v === "number" && v >= cond.gte;
  if ("lte" in cond) return typeof v === "number" && v <= cond.lte;
  return true;
}

/** Evaluate a (possibly nested) visibility tree. Absent tree = visible. */
export function evaluateVisibility(rule: Visibility | undefined, values: FormValues): boolean {
  if (!rule) return true;
  if ("all" in rule) return rule.all.every((r) => evaluateVisibility(r, values));
  if ("any" in rule) return rule.any.some((r) => evaluateVisibility(r, values));
  return evaluateCondition(rule, values);
}

/** Field names a condition/visibility tree depends on (for scoped subscriptions). */
export function extractDeps(rule: Visibility | Condition | undefined): string[] {
  if (!rule) return [];
  if ("all" in rule) return dedupe(rule.all.flatMap(extractDeps));
  if ("any" in rule) return dedupe(rule.any.flatMap(extractDeps));
  return [rule.field];
}

function dedupe(xs: string[]): string[] {
  return Array.from(new Set(xs));
}
