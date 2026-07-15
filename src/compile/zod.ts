import { z } from "zod";
import type { Field, FormSchema, FormValues, TranslateFn, ValidatorMap } from "../types";
import { evaluateVisibility, isEmpty, rebaseVisibility } from "../engine/condition";
import { emptyToUndefined } from "../engine/coerce";
import { getPath } from "../engine/path";
import { allFields, isActionField, isArrayValued } from "./schema-utils";

const identity: TranslateFn = (k) => k;

/** Build the Zod type for a single field's value (always optional at this layer). */
function compileField(field: Field, t: TranslateFn): z.ZodTypeAny {
  const v = field.validation;

  // repeatable group: an array of row objects, each row compiled recursively.
  // Row-level required/visibility rules run in the superRefine below.
  if (field.type === "array" && field.item) {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const f of field.item.fields) {
      if (!isActionField(f)) shape[f.name] = compileField(f, t);
    }
    let arr = z.array(z.object(shape));
    if (v?.minItems) arr = arr.min(v.minItems.value, t(v.minItems.message, { value: v.minItems.value }));
    if (v?.maxItems) arr = arr.max(v.maxItems.value, t(v.maxItems.message, { value: v.maxItems.value }));
    return arr.optional();
  }

  // array-valued fields: `multiselect`, or `select` with the `multiple` flag
  if (isArrayValued(field)) {
    let arr = z.array(z.union([z.string(), z.number()]));
    if (v?.minItems) arr = arr.min(v.minItems.value, t(v.minItems.message, { value: v.minItems.value }));
    if (v?.maxItems) arr = arr.max(v.maxItems.value, t(v.maxItems.message, { value: v.maxItems.value }));
    return arr.optional();
  }

  let base: z.ZodTypeAny;

  switch (field.type) {
    case "number":
    case "range": {
      let n = z.number();
      if (v?.min) n = n.min(Number(v.min.value), t(v.min.message, { value: v.min.value }));
      if (v?.max) n = n.max(Number(v.max.value), t(v.max.message, { value: v.max.value }));
      // optional INSIDE the preprocess so "" -> undefined satisfies it
      return z.preprocess(emptyToUndefined, n.optional());
    }
    case "checkbox":
    case "switch":
      base = z.boolean();
      break;
    case "select":
    case "radio":
      // option values may be numeric (coerced back through declared options)
      base = z.union([z.string(), z.number()]);
      break;
    case "file":
      // SSR-safe: File is undefined on the server, so don't assert instanceof there.
      base = z.custom<File | File[]>((val) => {
        if (typeof File === "undefined") return true;
        if (Array.isArray(val)) return val.every((x) => x instanceof File);
        return val instanceof File;
      });
      break;
    case "email": {
      let s = z.string().email(t(v?.email?.message ?? "Invalid email address."));
      base = applyStringRules(s, field, t);
      break;
    }
    case "url": {
      let s = z.string().url(t(v?.url?.message ?? "Invalid URL."));
      base = applyStringRules(s, field, t);
      break;
    }
    default:
      base = applyStringRules(z.string(), field, t);
  }

  // Every field is optional here; "required" is enforced by the visibility-aware
  // superRefine below so hidden required fields never block submit.
  return base.optional();
}

function applyStringRules(s: z.ZodString, field: Field, t: TranslateFn): z.ZodTypeAny {
  const v = field.validation;
  let out = s;
  if (v?.minLength) out = out.min(v.minLength.value, t(v.minLength.message, { value: v.minLength.value }));
  if (v?.maxLength) out = out.max(v.maxLength.value, t(v.maxLength.message, { value: v.maxLength.value }));
  if (v?.pattern) out = out.regex(new RegExp(v.pattern.value), t(v.pattern.message));
  // allow "" through so optional empty fields don't trip minLength etc. when hidden
  return out.or(z.literal(""));
}

/**
 * Compile a full schema into a Zod object whose refinements honor visibility,
 * conditional-required, file constraints, and cross-field rules — recursively
 * through array rows (conditions inside a row are rebased onto that row).
 * `validators` backs `{ type: "custom" }` rules (injected, like resolvers).
 */
export function compileZod(
  schema: FormSchema,
  t: TranslateFn = identity,
  validators: ValidatorMap = {},
) {
  const fields = allFields(schema);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) shape[f.name] = compileField(f, t);

  return z.object(shape).superRefine((values, ctx) => {
    const vals = values as FormValues;
    checkFieldList(fields, undefined, vals, ctx, t);
    for (const r of schema.rules ?? []) applyRule(r, vals, ctx, t, validators);
  });
}

/** "contacts.0.name" → ["contacts", 0, "name"] so RHF maps the issue to the row input. */
function issuePath(name: string): (string | number)[] {
  return name.split(".").map((s) => (/^\d+$/.test(s) ? Number(s) : s));
}

function checkFieldList(
  fields: readonly Field[],
  prefix: string | undefined,
  vals: FormValues,
  ctx: z.RefinementCtx,
  t: TranslateFn,
) {
  for (const f of fields) {
    if (isActionField(f)) continue;
    const name = prefix ? `${prefix}.${f.name}` : f.name;
    // hidden → skip all its rules (row conditions resolve against this row first)
    if (!evaluateVisibility(rebaseVisibility(f.visibleWhen, prefix), vals)) continue;
    const value = getPath(vals, name);

    const required =
      !!f.validation?.required ||
      (f.requiredWhen ? evaluateVisibility(rebaseVisibility(f.requiredWhen, prefix), vals) : false);

    if (required && isEmpty(value)) {
      ctx.addIssue({
        code: "custom",
        path: issuePath(name),
        message: t(f.validation?.required?.message ?? "This field is required."),
      });
      continue;
    }

    if (f.type === "file" && !isEmpty(value)) checkFile(f, name, value, ctx, t);

    if (f.type === "array" && f.item && Array.isArray(value)) {
      value.forEach((_, i) => checkFieldList(f.item!.fields, `${name}.${i}`, vals, ctx, t));
    }
  }
}

function checkFile(field: Field, name: string, value: unknown, ctx: z.RefinementCtx, t: TranslateFn) {
  const v = field.validation;
  const files: File[] = Array.isArray(value) ? value : value instanceof File ? [value] : [];
  if (v?.maxFiles && files.length > v.maxFiles.value)
    ctx.addIssue({ code: "custom", path: issuePath(name), message: t(v.maxFiles.message, { value: v.maxFiles.value }) });
  if (v?.maxSize) {
    const limit = v.maxSize.value * 1024 * 1024;
    if (files.some((f) => f.size > limit))
      ctx.addIssue({ code: "custom", path: issuePath(name), message: t(v.maxSize.message, { value: v.maxSize.value }) });
  }
  if (v?.fileTypes) {
    const ok = files.every((f) =>
      v.fileTypes!.value.some((p) => (p.startsWith(".") ? f.name.endsWith(p) : f.type === p)),
    );
    if (!ok)
      ctx.addIssue({ code: "custom", path: issuePath(name), message: t(v.fileTypes.message) });
  }
}

function applyRule(
  r: NonNullable<FormSchema["rules"]>[number],
  vals: FormValues,
  ctx: z.RefinementCtx,
  t: TranslateFn,
  validators: ValidatorMap,
) {
  const fail = (path: string, message: string) =>
    ctx.addIssue({ code: "custom", path: [path], message: t(message) });

  if (r.type === "custom") {
    const fn = validators[r.validator];
    if (fn && fn(vals) === false) fail(r.path, r.message);
    return;
  }
  if (r.type === "requiredIf") {
    if (evaluateVisibility(r.when, vals) && isEmpty(getPath(vals, r.field))) fail(r.path, r.message);
    return;
  }
  const [a, b] = r.fields;
  const av = getPath(vals, a);
  const bv = getPath(vals, b);
  switch (r.type) {
    case "equals":
      if (av !== bv) fail(r.path, r.message);
      break;
    case "gt":
      if (!((av as number) > (bv as number))) fail(r.path, r.message);
      break;
    case "lt":
      if (!((av as number) < (bv as number))) fail(r.path, r.message);
      break;
    case "gte":
      if (!((av as number) >= (bv as number))) fail(r.path, r.message);
      break;
    case "lte":
      if (!((av as number) <= (bv as number))) fail(r.path, r.message);
      break;
  }
}
