import type { Field, FormSchema, Validation } from "../types";

// ─────────────────────────── public contract ───────────────────────────

export type DiffSeverity = "breaking" | "risky" | "cosmetic";

export interface DiffFinding {
  severity: DiffSeverity;
  /** stable machine code, e.g. "field-removed", "constraint-tightened" */
  code: string;
  /** logical field path ("email", "items[].price") or "$" for schema-level */
  path: string;
  message: string;
  before?: unknown;
  after?: unknown;
}

export interface DiffOptions {
  /** disable the rename heuristic — removed+added pairs report as remove+add */
  strict?: boolean;
}

export interface DiffReport {
  reportVersion: 1;
  findings: readonly DiffFinding[];
  counts: Record<DiffSeverity, number>;
}

/**
 * Semantic diff between two form schemas, classified by impact on existing
 * data (saved drafts, stored submissions, API consumers):
 *
 * - "breaking"  — old payloads become invalid or lose data
 * - "risky"     — behavior changes but old payloads still validate
 * - "cosmetic"  — presentation only (labels, ordering, layout)
 *
 * Pure and deterministic: findings are sorted severity → path → code, so the
 * output is snapshot- and CI-friendly. The CLI (`form-render diff`) is a thin
 * formatter over this function.
 */
export function diffSchemas(a: FormSchema, b: FormSchema, opts: DiffOptions = {}): DiffReport {
  const findings: DiffFinding[] = [];
  const add = (severity: DiffSeverity, code: string, path: string, message: string, before?: unknown, after?: unknown) => {
    const f: DiffFinding = { severity, code, path, message };
    if (before !== undefined) f.before = before;
    if (after !== undefined) f.after = after;
    findings.push(f);
  };

  diffSchemaLevel(a, b, add);

  const oldFields = collectFields(a);
  const newFields = collectFields(b);

  // pair up removed/added before reporting: array-boundary moves, then renames
  const removed = [...oldFields.keys()].filter((k) => !newFields.has(k));
  const added = [...newFields.keys()].filter((k) => !oldFields.has(k));
  const consumedRemoved = new Set<string>();
  const consumedAdded = new Set<string>();

  for (const rk of removed) {
    const rEntry = oldFields.get(rk)!;
    const terminal = rk.split("[].").pop()!;
    const move = added.find(
      (ak) =>
        !consumedAdded.has(ak) &&
        ak.split("[].").pop() === terminal &&
        newFields.get(ak)!.field.type === rEntry.field.type,
    );
    if (move) {
      consumedRemoved.add(rk);
      consumedAdded.add(move);
      add(
        "breaking",
        "moved-across-array-boundary",
        rk,
        `"${rk}" moved to "${move}" — the value shape of existing payloads changes.`,
        rk,
        move,
      );
    }
  }

  if (!opts.strict) {
    for (const rk of removed) {
      if (consumedRemoved.has(rk)) continue;
      const rEntry = oldFields.get(rk)!;
      let best: { key: string; score: number } | null = null;
      for (const ak of added) {
        if (consumedAdded.has(ak)) continue;
        const aEntry = newFields.get(ak)!;
        if (aEntry.field.type !== rEntry.field.type) continue;
        if (parentOf(ak) !== parentOf(rk)) continue;
        const score = renameScore(rEntry.field, aEntry.field);
        if (score >= 2 && (!best || score > best.score)) best = { key: ak, score };
      }
      if (best) {
        consumedRemoved.add(rk);
        consumedAdded.add(best.key);
        add(
          "risky",
          "field-probably-renamed",
          rk,
          `"${rk}" was probably renamed to "${best.key}" (same type + matching properties). ` +
            `Old payloads still carry the old key. Use --strict to treat this as remove + add.`,
          rk,
          best.key,
        );
      }
    }
  }

  for (const rk of removed) {
    if (consumedRemoved.has(rk)) continue;
    add("breaking", "field-removed", rk, `Field "${rk}" was removed — its value in existing payloads is dropped.`);
  }
  for (const ak of added) {
    if (consumedAdded.has(ak)) continue;
    const f = newFields.get(ak)!.field;
    if (f.validation?.required || f.requiredWhen) {
      add(
        "breaking",
        "required-field-added",
        ak,
        `New ${f.requiredWhen ? "conditionally " : ""}required field "${ak}" — existing payloads don't have it.`,
      );
    } else {
      add("risky", "field-added", ak, `New optional field "${ak}" was added.`);
    }
  }

  // per-field comparison for surviving fields
  for (const [key, oldEntry] of oldFields) {
    const newEntry = newFields.get(key);
    if (!newEntry) continue;
    diffField(key, oldEntry, newEntry, add);
  }

  // order-only changes within a container → one cosmetic finding per container
  diffOrder(oldFields, newFields, add);

  const rank: Record<DiffSeverity, number> = { breaking: 0, risky: 1, cosmetic: 2 };
  findings.sort(
    (x, y) => rank[x.severity] - rank[y.severity] || x.path.localeCompare(y.path) || x.code.localeCompare(y.code),
  );
  const counts: Record<DiffSeverity, number> = { breaking: 0, risky: 0, cosmetic: 0 };
  for (const f of findings) counts[f.severity]++;
  return { reportVersion: 1, findings, counts };
}

// ─────────────────────────── field collection ──────────────────────────

interface Entry {
  field: Field;
  /** container the field sits in: "" (root), "step:<id>", or "<arrayKey>[]" */
  container: string;
  /** position within the container */
  order: number;
  stepId?: string;
}

function collectFields(schema: FormSchema): Map<string, Entry> {
  const map = new Map<string, Entry>();
  const walk = (fields: readonly Field[] | undefined, prefix: string, container: string, stepId?: string) => {
    (fields ?? []).forEach((f, order) => {
      const key = prefix ? `${prefix}[].${f.name}` : f.name;
      map.set(key, { field: f, container, order, stepId });
      if (f.type === "array" && f.item?.fields) walk(f.item.fields, key, `${key}[]`, stepId);
    });
  };
  walk(schema.fields, "", "", undefined);
  (schema.steps ?? []).forEach((s) => walk(s.fields, "", `step:${s.id}`, s.id));
  return map;
}

const parentOf = (key: string) => key.includes("[].") ? key.slice(0, key.lastIndexOf("[].")) : "";

// ─────────────────────────── comparison rules ──────────────────────────

type AddFn = (severity: DiffSeverity, code: string, path: string, message: string, before?: unknown, after?: unknown) => void;

/** stable stringify (sorted keys) so JSON key order never produces findings */
function stable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "undefined";
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
}
const eq = (x: unknown, y: unknown) => stable(x) === stable(y);

/** rename heuristic score: matching secondary properties (must be ≥2) */
function renameScore(a: Field, b: Field): number {
  let n = 0;
  const both = (x: unknown, y: unknown) => (x !== undefined || y !== undefined) && eq(x, y);
  if (both(a.label, b.label)) n++;
  if (both(a.validation, b.validation)) n++;
  if (both(a.options, b.options)) n++;
  if (both(a.default, b.default)) n++;
  if (both(a.placeholder, b.placeholder)) n++;
  return n;
}

/** value shape a field's submitted data takes; type changes across shapes are breaking */
const SHAPES: Record<string, string> = {
  text: "string", textarea: "string", email: "string", password: "string", tel: "string",
  url: "string", date: "string", time: "string", "datetime-local": "string", month: "string",
  week: "string", color: "string", hidden: "string",
  select: "choice", radio: "choice",
  number: "number", range: "number",
  checkbox: "boolean", switch: "boolean",
  multiselect: "list", array: "rows", file: "file",
};
const shapeOf = (t: string) => SHAPES[t] ?? `custom:${t}`;

function diffField(key: string, oldE: Entry, newE: Entry, add: AddFn) {
  const o = oldE.field;
  const n = newE.field;

  if (o.type !== n.type) {
    if (shapeOf(o.type) === shapeOf(n.type)) {
      add("risky", "type-changed", key, `Type changed ${o.type} → ${n.type} (same value shape).`, o.type, n.type);
    } else {
      add("breaking", "type-shape-changed", key, `Type changed ${o.type} → ${n.type} — the value shape of existing payloads changes.`, o.type, n.type);
    }
  }
  if (Boolean(o.multiple) !== Boolean(n.multiple)) {
    add("breaking", "multiplicity-changed", key, `"multiple" toggled — the value switches between scalar and array.`, Boolean(o.multiple), Boolean(n.multiple));
  }

  diffValidation(key, o.validation, n.validation, add);
  diffOptions(key, o, n, add);

  for (const cond of ["visibleWhen", "requiredWhen", "disabledWhen"] as const) {
    if (!eq(o[cond], n[cond])) {
      const severity = cond === "requiredWhen" && !o[cond] && n[cond] ? "breaking" : "risky";
      const code = severity === "breaking" ? "required-condition-added" : `${cond}-changed`;
      add(severity, code, key, severity === "breaking"
        ? `"requiredWhen" added — existing payloads may be missing a now-required value.`
        : `"${cond}" condition changed.`, o[cond], n[cond]);
    }
  }

  if (!eq(o.computed, n.computed)) add("risky", "computed-changed", key, `Computed definition changed.`, o.computed, n.computed);
  if (!eq(o.effects, n.effects)) add("risky", "effects-changed", key, `Effects changed.`);
  if (!eq(o.default, n.default)) add("risky", "default-changed", key, `Default value changed.`, o.default, n.default);
  if ((o.upload ?? null) !== (n.upload ?? null)) add("risky", "upload-changed", key, `Uploader changed.`, o.upload, n.upload);
  if ((o.mask ?? null) !== (n.mask ?? null)) add("risky", "mask-changed", key, `Input mask changed — stored raw values may not fit the new mask.`, o.mask, n.mask);
  if (!eq(o.asyncValidation, n.asyncValidation)) add("risky", "async-validation-changed", key, `Async validation changed.`);
  if (Boolean(o.disabled) !== Boolean(n.disabled) || Boolean(o.readOnly) !== Boolean(n.readOnly)) {
    add("risky", "editability-changed", key, `disabled/readOnly changed.`);
  }
  if ((o.defaultItems ?? 0) !== (n.defaultItems ?? 0)) add("risky", "default-items-changed", key, `defaultItems changed.`, o.defaultItems, n.defaultItems);
  if (oldE.stepId !== newE.stepId) {
    add("risky", "step-moved", key, `Field moved between steps ("${oldE.stepId ?? "root"}" → "${newE.stepId ?? "root"}").`, oldE.stepId, newE.stepId);
  }

  // presentation-only
  const textProps = ["label", "description", "tooltip", "placeholder", "addText", "removeText", "prefix", "suffix", "text", "alt"] as const;
  const changedText = textProps.filter((p) => !eq(o[p], n[p]));
  if (changedText.length) {
    add("cosmetic", "text-changed", key, `Display text changed: ${changedText.join(", ")}.`);
  }
  const looks = ["width", "className", "classNames", "rows", "step", "sortable", "clearable"] as const;
  const changedLooks = looks.filter((p) => !eq(o[p], n[p]));
  if (changedLooks.length) {
    add("cosmetic", "presentation-changed", key, `Presentation changed: ${changedLooks.join(", ")}.`);
  }
}

/** bound rules: [key, direction] — "up" = raising tightens, "down" = lowering tightens */
const BOUNDS: readonly [keyof Validation, "up" | "down"][] = [
  ["minLength", "up"], ["min", "up"], ["minItems", "up"],
  ["maxLength", "down"], ["max", "down"], ["maxItems", "down"], ["maxFiles", "down"], ["maxSize", "down"],
];

function diffValidation(key: string, o: Validation | undefined, n: Validation | undefined, add: AddFn) {
  const ov = o ?? {};
  const nv = n ?? {};

  if (!ov.required && nv.required) add("breaking", "required-added", key, `"required" added — existing payloads may be missing this value.`);
  if (ov.required && !nv.required) add("risky", "required-removed", key, `"required" removed.`);

  const op = ov.pattern?.value;
  const np = nv.pattern?.value;
  if (op !== np) {
    if (np === undefined) add("risky", "pattern-removed", key, `Pattern removed.`, op);
    else if (op === undefined) add("breaking", "pattern-added", key, `Pattern added — existing values may not match.`, undefined, np);
    else add("breaking", "pattern-changed", key, `Pattern changed — existing values may not match the new pattern.`, op, np);
  }

  for (const [prop, dir] of BOUNDS) {
    const oldRule = ov[prop] as { value?: unknown } | undefined;
    const newRule = nv[prop] as { value?: unknown } | undefined;
    const ovVal = oldRule?.value;
    const nvVal = newRule?.value;
    if (eq(ovVal, nvVal)) continue;
    if (nvVal === undefined) {
      add("risky", "constraint-loosened", key, `"${String(prop)}" removed.`, ovVal);
      continue;
    }
    if (ovVal === undefined) {
      add("breaking", "constraint-tightened", key, `"${String(prop)}" added — existing values may violate it.`, undefined, nvVal);
      continue;
    }
    // both numeric-ish/comparable: direction decides tighten vs loosen.
    // numbers compare numerically; ISO date/time bounds compare lexically.
    const later = (x: unknown, y: unknown): boolean => {
      const nx = Number(x);
      const ny = Number(y);
      if (!Number.isNaN(nx) && !Number.isNaN(ny)) return ny > nx;
      return String(y) > String(x);
    };
    const tightened = dir === "up" ? later(ovVal, nvVal) : later(nvVal, ovVal);
    if (tightened) add("breaking", "constraint-tightened", key, `"${String(prop)}" tightened (${JSON.stringify(ovVal)} → ${JSON.stringify(nvVal)}).`, ovVal, nvVal);
    else add("risky", "constraint-loosened", key, `"${String(prop)}" loosened (${JSON.stringify(ovVal)} → ${JSON.stringify(nvVal)}).`, ovVal, nvVal);
  }

  for (const flag of ["email", "url"] as const) {
    if (!ov[flag] && nv[flag]) add("breaking", "constraint-tightened", key, `"${flag}" format check added — existing values may violate it.`);
    if (ov[flag] && !nv[flag]) add("risky", "constraint-loosened", key, `"${flag}" format check removed.`);
  }

  const oldTypes = ov.fileTypes?.value;
  const newTypes = nv.fileTypes?.value;
  if (!eq(oldTypes, newTypes)) {
    const removedTypes = (oldTypes ?? []).filter((t) => !(newTypes ?? []).includes(t));
    if (newTypes !== undefined && (oldTypes === undefined || removedTypes.length)) {
      add("breaking", "constraint-tightened", key, `Allowed file types narrowed${removedTypes.length ? ` (removed: ${removedTypes.join(", ")})` : ""}.`, oldTypes, newTypes);
    } else {
      add("risky", "constraint-loosened", key, `Allowed file types broadened.`, oldTypes, newTypes);
    }
  }

  // message-only edits on rules whose values are identical → cosmetic
  const msgProps = Object.keys({ ...ov, ...nv }) as (keyof Validation)[];
  const msgChanged = msgProps.filter((p) => {
    const a = ov[p] as { value?: unknown; message?: string } | undefined;
    const b = nv[p] as { value?: unknown; message?: string } | undefined;
    return a && b && eq(a.value, b.value) && a.message !== b.message;
  });
  if (msgChanged.length) add("cosmetic", "validation-message-changed", key, `Validation messages changed: ${msgChanged.join(", ")}.`);
}

function diffOptions(key: string, o: Field, n: Field, add: AddFn) {
  if (!eq(o.optionsSource, n.optionsSource)) {
    add("risky", "options-source-changed", key, `Dynamic options (loader/dependsOn) changed.`, o.optionsSource, n.optionsSource);
  }
  const oldOpts = o.options;
  const newOpts = n.options;
  if (oldOpts === undefined && newOpts === undefined) return;
  const oldVals = new Map((oldOpts ?? []).map((x) => [String(x.value), x]));
  const newVals = new Map((newOpts ?? []).map((x) => [String(x.value), x]));
  const removedVals = [...oldVals.keys()].filter((v) => !newVals.has(v));
  const addedVals = [...newVals.keys()].filter((v) => !oldVals.has(v));
  if (removedVals.length) {
    add("breaking", "option-removed", key, `Option value(s) removed: ${removedVals.join(", ")} — payloads holding them no longer validate.`, removedVals);
  }
  if (addedVals.length) {
    add("risky", "option-added", key, `Option value(s) added: ${addedVals.join(", ")}.`, undefined, addedVals);
  }
  const relabeled = [...oldVals.keys()].filter((v) => newVals.has(v) && oldVals.get(v)!.label !== newVals.get(v)!.label);
  if (relabeled.length) add("cosmetic", "option-label-changed", key, `Option label(s) changed for: ${relabeled.join(", ")}.`);
}

function diffOrder(oldFields: Map<string, Entry>, newFields: Map<string, Entry>, add: AddFn) {
  const containers = new Map<string, { before: string[]; after: string[] }>();
  for (const [key, e] of oldFields) {
    if (!newFields.has(key)) continue;
    const c = containers.get(e.container) ?? { before: [], after: [] };
    c.before.push(key);
    containers.set(e.container, c);
  }
  for (const [key, e] of newFields) {
    if (!oldFields.has(key)) continue;
    // order by the NEW schema's ordering; container attribution follows the new side
    const c = containers.get(e.container) ?? { before: [], after: [] };
    c.after.push(key);
    containers.set(e.container, c);
  }
  for (const [container, { before, after }] of containers) {
    const sortByOrder = (m: Map<string, Entry>) => (x: string, y: string) => m.get(x)!.order - m.get(y)!.order;
    const b = [...before].sort(sortByOrder(oldFields));
    const a = [...after].sort(sortByOrder(newFields));
    const shared = b.filter((k) => a.includes(k));
    const aShared = a.filter((k) => b.includes(k));
    if (shared.join(" ") !== aShared.join(" ")) {
      add("cosmetic", "order-changed", container || "$", `Field order changed within ${container || "the form root"}.`);
    }
  }
}

function diffSchemaLevel(a: FormSchema, b: FormSchema, add: AddFn) {
  if (a.id !== b.id) {
    add("risky", "form-id-changed", "$", `Form id changed ("${a.id}" → "${b.id}") — persisted drafts keyed by the old id are orphaned.`, a.id, b.id);
  }
  if (a.version !== b.version) {
    add("risky", "version-changed", "$", `Schema version changed (${a.version} → ${b.version}).`, a.version, b.version);
  }
  if (!eq(a.settings, b.settings)) add("risky", "settings-changed", "$", `Form settings changed.`, a.settings, b.settings);
  if (!eq(a.rules, b.rules)) add("risky", "rules-changed", "$", `Cross-field rules changed.`);
  if (!eq(a.actions, b.actions)) add("risky", "actions-changed", "$", `Form actions changed.`);

  const oldSteps = (a.steps ?? []).map((s) => s.id);
  const newSteps = (b.steps ?? []).map((s) => s.id);
  for (const id of oldSteps.filter((s) => !newSteps.includes(s))) {
    add("risky", "step-removed", "$", `Step "${id}" removed (its fields are reported individually).`);
  }
  for (const id of newSteps.filter((s) => !oldSteps.includes(s))) {
    add("risky", "step-added", "$", `Step "${id}" added.`);
  }

  if (!eq(a.layout, b.layout) || !eq(a.sections, b.sections)) {
    add("cosmetic", "layout-changed", "$", `Layout/sections changed.`);
  }
  const stepPresentation = (s?: readonly { id: string; layout?: unknown; sections?: unknown }[]) =>
    (s ?? []).map((x) => ({ id: x.id, layout: x.layout, sections: x.sections }));
  if (eq(oldSteps, newSteps) && !eq(stepPresentation(a.steps), stepPresentation(b.steps))) {
    // step-level layout/sections tweaks (titles are covered per-field/text rules elsewhere)
    const changed = (a.steps ?? []).some((s, i) => {
      const t = (b.steps ?? [])[i];
      return t && (!eq(s.layout, t.layout) || !eq(s.sections, t.sections));
    });
    if (changed) add("cosmetic", "layout-changed", "$", `Step layout/sections changed.`);
  }
}
