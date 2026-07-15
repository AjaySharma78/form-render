import type { Condition, Field, FormSchema, Visibility } from "../types";
import { extractDeps } from "../engine/condition";
import { allDeclaredFields, allFields, isActionField } from "./schema-utils";

const MAX_ARRAY_DEPTH = 3;

/**
 * Dev-time sanity check on the schema itself: duplicate/dotted names, missing
 * array `item` specs, over-deep nesting, and conditions / rules that reference
 * unknown fields (row conditions may use sibling names or `$.` root refs).
 * Throws with all problems collected. It does not run validation on values.
 */
export function validateSchema(schema: FormSchema): void {
  const errors: string[] = [];
  const names = allDeclaredFields(schema).map((f) => f.name);
  const rootKnown = new Set(allFields(schema).map((f) => f.name));

  const checkNames = (ns: readonly string[], scope: string) => {
    const seen = new Set<string>();
    for (const n of ns) {
      if (n.includes("."))
        errors.push(
          `Field name "${n}"${scope} must not contain "." — names are path segments; nesting comes from container fields.`,
        );
      if (seen.has(n)) errors.push(`Duplicate field name: "${n}"${scope}.`);
      seen.add(n);
    }
  };

  checkNames(names, "");

  /** `known` = names addressable by bare refs in this scope (root or one row). */
  const checkRef = (field: string, known: ReadonlySet<string>, ctx: string) => {
    if (field.startsWith("$.")) {
      if (!rootKnown.has(field.slice(2)))
        errors.push(`${ctx} references unknown root field "${field}".`);
      return;
    }
    if (!known.has(field)) errors.push(`${ctx} references unknown field "${field}".`);
  };
  const checkVisibility = (
    rule: Visibility | Condition | undefined,
    known: ReadonlySet<string>,
    ctx: string,
  ) => {
    for (const dep of extractDeps(rule)) checkRef(dep, known, ctx);
    checkRegexes(rule, ctx);
  };
  const checkRegexes = (rule: Visibility | Condition | undefined, ctx: string) => {
    if (!rule) return;
    if ("all" in rule) return rule.all.forEach((r) => checkRegexes(r, ctx));
    if ("any" in rule) return rule.any.forEach((r) => checkRegexes(r, ctx));
    if ("matches" in rule) {
      try {
        new RegExp(rule.matches);
      } catch {
        errors.push(`${ctx} has an invalid \`matches\` regex: ${JSON.stringify(rule.matches)}.`);
      }
    }
  };

  // dependency graph for computed/effects cycle detection. Node ids are
  // scope-qualified ("contacts.cname" for a row field); indices are irrelevant
  // to cyclicity so array scopes collapse to the array's field name.
  const edges = new Map<string, Set<string>>();
  const addEdge = (from: string, to: string) => {
    if (!edges.has(from)) edges.set(from, new Set());
    edges.get(from)!.add(to);
  };
  const scopedId = (ref: string, scopePrefix: string) =>
    ref.startsWith("$.") ? ref.slice(2) : scopePrefix + ref;

  const checkFieldRules = (f: Field, known: ReadonlySet<string>, scopePrefix = "") => {
    checkVisibility(f.visibleWhen, known, `Field "${f.name}".visibleWhen`);
    checkVisibility(f.requiredWhen, known, `Field "${f.name}".requiredWhen`);
    checkVisibility(f.disabledWhen, known, `Field "${f.name}".disabledWhen`);

    const id = scopePrefix + f.name;
    if (f.computed) {
      for (const input of f.computed.inputs) {
        checkRef(input, known, `Field "${f.name}".computed`);
        addEdge(scopedId(input, scopePrefix), id);
      }
    }
    for (const [i, e] of (f.effects ?? []).entries()) {
      checkVisibility(e.when, known, `Field "${f.name}".effects[${i}].when`);
      for (const target of Object.keys(e.set)) {
        checkRef(target, known, `Field "${f.name}".effects[${i}].set`);
        addEdge(id, scopedId(target, scopePrefix));
      }
    }
  };

  const checkArray = (f: Field, depth: number, ctx: string) => {
    if (!f.item || f.item.fields.length === 0) {
      errors.push(`${ctx} is an array field but has no item.fields.`);
      return;
    }
    if (depth > MAX_ARRAY_DEPTH) {
      errors.push(`${ctx} nests arrays deeper than ${MAX_ARRAY_DEPTH} levels.`);
      return;
    }
    const rowFields = f.item.fields;
    for (const rf of rowFields) {
      if (isActionField(rf))
        errors.push(`${ctx} row field "${rf.name}" is an action control — not allowed inside rows.`);
    }
    checkNames(rowFields.map((rf) => rf.name), ` (in "${f.name}" rows)`);
    const rowKnown = new Set(rowFields.filter((rf) => !isActionField(rf)).map((rf) => rf.name));
    for (const rf of rowFields) {
      checkFieldRules(rf, rowKnown, `${ctxPathOf(ctx)}.`);
      if (rf.type === "array") checkArray(rf, depth + 1, `Field "${ctxPathOf(ctx)}.${rf.name}"`);
    }
  };
  /** `Field "contacts.phones"` → "contacts.phones" (scope prefix for graph node ids) */
  const ctxPathOf = (ctx: string) => ctx.replace(/^Field "/, "").replace(/"$/, "");

  for (const f of allDeclaredFields(schema)) {
    checkFieldRules(f, rootKnown);
    if (f.type === "array") checkArray(f, 1, `Field "${f.name}"`);
  }

  for (const r of schema.rules ?? []) {
    if ("fields" in r) r.fields.forEach((fn) => checkRef(fn, rootKnown, `Rule "${r.type}"`));
    if ("field" in r) checkRef(r.field, rootKnown, `Rule "${r.type}"`);
    if ("when" in r) checkVisibility(r.when, rootKnown, `Rule "${r.type}".when`);
  }

  // computed/effects must form a DAG — a cycle would recompute forever at runtime
  const cycle = findCycle(edges);
  if (cycle) errors.push(`Computed/effects cycle: ${cycle.join(" → ")}.`);

  if (errors.length) {
    throw new Error(`[form-render] Invalid schema "${schema.id}":\n - ${errors.join("\n - ")}`);
  }
}

/** DFS three-color cycle search; returns the cycle path (closed) or null. */
function findCycle(edges: ReadonlyMap<string, ReadonlySet<string>>): string[] | null {
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];

  const visit = (node: string): string[] | null => {
    const s = state.get(node);
    if (s === "done") return null;
    if (s === "visiting") {
      const start = stack.indexOf(node);
      return [...stack.slice(start), node];
    }
    state.set(node, "visiting");
    stack.push(node);
    for (const next of edges.get(node) ?? []) {
      const found = visit(next);
      if (found) return found;
    }
    stack.pop();
    state.set(node, "done");
    return null;
  };

  for (const node of edges.keys()) {
    const found = visit(node);
    if (found) return found;
  }
  return null;
}
