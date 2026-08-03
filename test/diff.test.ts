import { describe, expect, it } from "vitest";
import { diffSchemas } from "../src/engine/diff";
import type { FormSchema } from "../src/types";

const base = (over: Partial<FormSchema> = {}): FormSchema => ({
  id: "f",
  version: 2,
  fields: [
    { name: "email", type: "email", label: "Email", validation: { required: { message: "req" } } },
    {
      name: "plan",
      type: "select",
      label: "Plan",
      options: [
        { value: "free", label: "Free" },
        { value: "pro", label: "Pro" },
      ],
    },
    { name: "age", type: "number", label: "Age", validation: { min: { value: 18, message: "18+" } } },
  ],
  ...over,
});

const clone = (s: FormSchema): FormSchema => JSON.parse(JSON.stringify(s));

function withField(s: FormSchema, name: string, patch: Record<string, unknown>): FormSchema {
  const next = clone(s);
  const f = next.fields!.find((x) => x.name === name)! as Record<string, unknown>;
  Object.assign(f, patch);
  return next;
}

const codes = (r: ReturnType<typeof diffSchemas>) => r.findings.map((f) => `${f.severity}:${f.code}:${f.path}`);

describe("diffSchemas — identity & determinism", () => {
  it("identical schemas produce zero findings", () => {
    expect(diffSchemas(base(), base()).findings).toHaveLength(0);
  });

  it("JSON key order does not matter", () => {
    const a = base();
    const b = clone(base());
    // re-create each field object with reversed key insertion order
    b.fields = b.fields!.map((f) => Object.fromEntries(Object.entries(f).reverse()) as unknown as (typeof b.fields extends readonly (infer F)[] | undefined ? F : never));
    expect(diffSchemas(a, b).findings).toHaveLength(0);
  });

  it("output is path-sorted within severity and counts add up", () => {
    let b = withField(base(), "age", { validation: { min: { value: 21, message: "21+" } } }); // breaking
    b = withField(b, "plan", { label: "Your plan" }); // cosmetic
    b = withField(b, "email", { default: "x@y.z" }); // risky
    const r = diffSchemas(base(), b);
    const sevs = r.findings.map((f) => f.severity);
    expect(sevs).toEqual([...sevs].sort((x, y) => ["breaking", "risky", "cosmetic"].indexOf(x) - ["breaking", "risky", "cosmetic"].indexOf(y)));
    expect(r.counts.breaking + r.counts.risky + r.counts.cosmetic).toBe(r.findings.length);
  });
});

describe("diffSchemas — removed / added / renamed", () => {
  it("removed field is breaking", () => {
    const b = clone(base());
    b.fields = b.fields!.filter((f) => f.name !== "age");
    expect(codes(diffSchemas(base(), b))).toContain("breaking:field-removed:age");
  });

  it("added optional field is risky; added required field is breaking", () => {
    const optional = clone(base());
    optional.fields = [...optional.fields!, { name: "nick", type: "text" }];
    expect(codes(diffSchemas(base(), optional))).toContain("risky:field-added:nick");

    const required = clone(base());
    required.fields = [
      ...required.fields!,
      { name: "ssn", type: "text", validation: { required: { message: "req" } } },
    ];
    expect(codes(diffSchemas(base(), required))).toContain("breaking:required-field-added:ssn");
  });

  it("same type + matching label/validation reports a probable rename (risky)", () => {
    const b = clone(base());
    b.fields = b.fields!.map((f) => (f.name === "email" ? { ...f, name: "workEmail" } : f));
    const r = diffSchemas(base(), b);
    expect(codes(r)).toContain("risky:field-probably-renamed:email");
    expect(codes(r)).not.toContain("breaking:field-removed:email");
  });

  it("--strict disables the rename heuristic", () => {
    const b = clone(base());
    b.fields = b.fields!.map((f) => (f.name === "email" ? { ...f, name: "workEmail" } : f));
    const r = diffSchemas(base(), b, { strict: true });
    expect(codes(r)).toContain("breaking:field-removed:email");
    expect(codes(r)).toContain("breaking:required-field-added:workEmail");
  });

  it("a bare renamed field (no matching secondary props) is remove + add", () => {
    const a: FormSchema = { id: "f", version: 2, fields: [{ name: "a", type: "text" }] };
    const b: FormSchema = { id: "f", version: 2, fields: [{ name: "b", type: "text" }] };
    const r = diffSchemas(a, b);
    expect(codes(r)).toContain("breaking:field-removed:a");
    expect(codes(r)).toContain("risky:field-added:b");
  });
});

describe("diffSchemas — types, options, validation", () => {
  it("type change within a value shape is risky; across shapes is breaking", () => {
    expect(codes(diffSchemas(base(), withField(base(), "email", { type: "text" })))).toContain(
      "risky:type-changed:email",
    );
    expect(codes(diffSchemas(base(), withField(base(), "email", { type: "number" })))).toContain(
      "breaking:type-shape-changed:email",
    );
  });

  it("toggling multiple is breaking (scalar ↔ array)", () => {
    expect(codes(diffSchemas(base(), withField(base(), "plan", { multiple: true })))).toContain(
      "breaking:multiplicity-changed:plan",
    );
  });

  it("option removal is breaking, addition risky, relabel cosmetic", () => {
    const removedOpt = withField(base(), "plan", { options: [{ value: "free", label: "Free" }] });
    expect(codes(diffSchemas(base(), removedOpt))).toContain("breaking:option-removed:plan");

    const addedOpt = withField(base(), "plan", {
      options: [
        { value: "free", label: "Free" },
        { value: "pro", label: "Pro" },
        { value: "team", label: "Team" },
      ],
    });
    expect(codes(diffSchemas(base(), addedOpt))).toContain("risky:option-added:plan");

    const relabel = withField(base(), "plan", {
      options: [
        { value: "free", label: "Starter" },
        { value: "pro", label: "Pro" },
      ],
    });
    expect(codes(diffSchemas(base(), relabel))).toEqual(["cosmetic:option-label-changed:plan"]);
  });

  it("required added is breaking; removed is risky", () => {
    expect(codes(diffSchemas(base(), withField(base(), "plan", { validation: { required: { message: "r" } } })))).toContain(
      "breaking:required-added:plan",
    );
    expect(codes(diffSchemas(base(), withField(base(), "email", { validation: {} })))).toContain(
      "risky:required-removed:email",
    );
  });

  it("tightened bounds are breaking, loosened risky (both directions)", () => {
    expect(codes(diffSchemas(base(), withField(base(), "age", { validation: { min: { value: 21, message: "m" } } })))).toContain(
      "breaking:constraint-tightened:age",
    );
    expect(codes(diffSchemas(base(), withField(base(), "age", { validation: { min: { value: 13, message: "m" } } })))).toContain(
      "risky:constraint-loosened:age",
    );
    const maxAdded = withField(base(), "age", {
      validation: { min: { value: 18, message: "m" }, max: { value: 65, message: "m" } },
    });
    expect(codes(diffSchemas(base(), maxAdded))).toContain("breaking:constraint-tightened:age");
  });

  it("pattern added/changed breaking; message-only change cosmetic", () => {
    const patternAdded = withField(base(), "email", {
      validation: { required: { message: "req" }, pattern: { value: "^a", message: "m" } },
    });
    expect(codes(diffSchemas(base(), patternAdded))).toContain("breaking:pattern-added:email");

    const msgOnly = withField(base(), "age", { validation: { min: { value: 18, message: "different" } } });
    expect(codes(diffSchemas(base(), msgOnly))).toEqual(["cosmetic:validation-message-changed:age"]);
  });
});

describe("diffSchemas — arrays, steps, schema level", () => {
  const withArray = (): FormSchema => ({
    id: "inv",
    version: 2,
    fields: [
      { name: "customer", type: "text" },
      {
        name: "items",
        type: "array",
        item: {
          fields: [
            { name: "desc", type: "text" },
            { name: "price", type: "number" },
          ],
        },
        validation: { maxItems: { value: 10, message: "max" } },
      },
    ],
  });

  it("recurses into array rows with items[] paths", () => {
    const b = clone(withArray());
    (b.fields![1].item!.fields as { name: string; type: string }[]).splice(1, 1); // drop price
    expect(codes(diffSchemas(withArray(), b))).toContain("breaking:field-removed:items[].price");
  });

  it("lowering maxItems is breaking", () => {
    const b = clone(withArray());
    (b.fields![1] as { validation: { maxItems: { value: number } } }).validation.maxItems.value = 3;
    expect(codes(diffSchemas(withArray(), b))).toContain("breaking:constraint-tightened:items");
  });

  it("moving a field into an array is breaking (value shape changes)", () => {
    const b = clone(withArray());
    b.fields = b.fields!.filter((f) => f.name !== "customer");
    (b.fields![0].item!.fields as unknown[]).push({ name: "customer", type: "text" });
    expect(codes(diffSchemas(withArray(), b))).toContain("breaking:moved-across-array-boundary:customer");
  });

  it("moving a field between steps is risky, not breaking", () => {
    const stepped = (secondStepHas: string[]): FormSchema => ({
      id: "w",
      version: 2,
      steps: [
        { id: "one", title: "One", fields: [{ name: "a", type: "text" }, { name: "b", type: "text" }].filter((f) => !secondStepHas.includes(f.name)) },
        { id: "two", title: "Two", fields: [{ name: "b", type: "text" }].filter((f) => secondStepHas.includes(f.name)) },
      ],
    });
    const r = diffSchemas(stepped([]), stepped(["b"]));
    expect(codes(r)).toContain("risky:step-moved:b");
    expect(r.counts.breaking).toBe(0);
  });

  it("order-only changes are a single cosmetic finding", () => {
    const b = clone(base());
    b.fields = [b.fields![1], b.fields![0], b.fields![2]];
    const r = diffSchemas(base(), b);
    expect(codes(r)).toEqual(["cosmetic:order-changed:$"]);
  });

  it("id / settings / rules changes are schema-level risky findings", () => {
    const b = clone(base());
    b.id = "g";
    b.settings = { hiddenValues: "keep" };
    const r = diffSchemas(base(), b);
    expect(codes(r)).toContain("risky:form-id-changed:$");
    expect(codes(r)).toContain("risky:settings-changed:$");
  });

  it("v1 → v2 version bump is a risky note", () => {
    const v1 = clone(base());
    v1.version = 1;
    expect(codes(diffSchemas(v1, base()))).toContain("risky:version-changed:$");
  });
});
