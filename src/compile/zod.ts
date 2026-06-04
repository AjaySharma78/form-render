import { z } from "zod";
import type { Field, FormSchema, FormValues, TranslateFn } from "../types";
import { evaluateCondition, evaluateVisibility, isEmpty } from "../engine/condition";
import { emptyToUndefined } from "../engine/coerce";
import { allFields, isArrayValued } from "./schema-utils";

const identity: TranslateFn = (k) => k;

/** Build the Zod type for a single field's value (always optional at this layer). */
function compileField(field: Field, t: TranslateFn): z.ZodTypeAny {
  const v = field.validation;

  // array-valued fields: `multiselect`, or `select` with the `multiple` flag
  if (isArrayValued(field)) {
    let arr = z.array(z.union([z.string(), z.number()]));
    if (v?.minItems) arr = arr.min(v.minItems.value, t(v.minItems.message));
    if (v?.maxItems) arr = arr.max(v.maxItems.value, t(v.maxItems.message));
    return arr.optional();
  }

  let base: z.ZodTypeAny;

  switch (field.type) {
    case "number":
    case "range": {
      let n = z.number();
      if (v?.min) n = n.min(Number(v.min.value), t(v.min.message));
      if (v?.max) n = n.max(Number(v.max.value), t(v.max.message));
      // optional INSIDE the preprocess so "" -> undefined satisfies it
      return z.preprocess(emptyToUndefined, n.optional());
    }
    case "checkbox":
    case "switch":
      base = z.boolean();
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
  if (v?.minLength) out = out.min(v.minLength.value, t(v.minLength.message));
  if (v?.maxLength) out = out.max(v.maxLength.value, t(v.maxLength.message));
  if (v?.pattern) out = out.regex(new RegExp(v.pattern.value), t(v.pattern.message));
  // allow "" through so optional empty fields don't trip minLength etc. when hidden
  return out.or(z.literal(""));
}

/**
 * Compile a full schema into a Zod object whose refinements honor visibility,
 * conditional-required, file constraints, and cross-field rules.
 */
export function compileZod(schema: FormSchema, t: TranslateFn = identity) {
  const fields = allFields(schema);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) shape[f.name] = compileField(f, t);

  return z.object(shape).superRefine((values, ctx) => {
    const vals = values as FormValues;

    for (const f of fields) {
      if (!evaluateVisibility(f.visibleWhen, vals)) continue; // hidden → skip all its rules
      const value = vals[f.name];

      const required =
        !!f.validation?.required ||
        (f.requiredWhen ? evaluateCondition(f.requiredWhen, vals) : false);

      if (required && isEmpty(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [f.name],
          message: t(f.validation?.required?.message ?? "This field is required."),
        });
        continue;
      }

      if (f.type === "file" && !isEmpty(value)) checkFile(f, value, ctx, t);
    }

    for (const r of schema.rules ?? []) applyRule(r, vals, ctx, t);
  });
}

function checkFile(field: Field, value: unknown, ctx: z.RefinementCtx, t: TranslateFn) {
  const v = field.validation;
  const files: File[] = Array.isArray(value) ? value : value instanceof File ? [value] : [];
  if (v?.maxFiles && files.length > v.maxFiles.value)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field.name], message: t(v.maxFiles.message) });
  if (v?.maxSize) {
    const limit = v.maxSize.value * 1024 * 1024;
    if (files.some((f) => f.size > limit))
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field.name], message: t(v.maxSize.message) });
  }
  if (v?.fileTypes) {
    const ok = files.every((f) =>
      v.fileTypes!.value.some((p) => (p.startsWith(".") ? f.name.endsWith(p) : f.type === p)),
    );
    if (!ok)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field.name], message: t(v.fileTypes.message) });
  }
}

function applyRule(
  r: NonNullable<FormSchema["rules"]>[number],
  vals: FormValues,
  ctx: z.RefinementCtx,
  t: TranslateFn,
) {
  const fail = (path: string, message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message: t(message) });

  if (r.type === "requiredIf") {
    if (evaluateCondition(r.when, vals) && isEmpty(vals[r.field])) fail(r.path, r.message);
    return;
  }
  const [a, b] = r.fields;
  const av = vals[a];
  const bv = vals[b];
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
