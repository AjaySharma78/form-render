import { describe, expect, it } from "vitest";
import { buildDefaults } from "../src/compile/defaults";
import { validateSchema } from "../src/compile/validate";
import { compileZod } from "../src/compile/zod";
import { evaluateVisibility } from "../src/engine/condition";
import type { FormSchema } from "../src/types";

const schema: FormSchema = {
  id: "t",
  version: 1,
  rules: [{ type: "equals", fields: ["pw", "cpw"], path: "cpw", message: "must match" }],
  fields: [
    { name: "useSsh", type: "switch", default: false },
    {
      name: "host",
      type: "text",
      visibleWhen: { field: "useSsh", is: true },
      validation: { required: { message: "host required" } },
    },
    {
      name: "port",
      type: "number",
      validation: { min: { value: 1, message: "min" }, max: { value: 65535, message: "max" } },
    },
    { name: "email", type: "email", validation: { email: { message: "bad email" } } },
    { name: "tags", type: "multiselect" },
    { name: "pw", type: "password" },
    { name: "cpw", type: "password" },
  ],
};

describe("buildDefaults", () => {
  it("gives type-correct empties for every field", () => {
    const d = buildDefaults(schema);
    expect(d).toMatchObject({ useSsh: false, host: "", email: "", tags: [], pw: "", cpw: "" });
    expect(d.port).toBeUndefined();
  });

  it("applies overrides (edit-mode prefill)", () => {
    expect(buildDefaults(schema, { host: "db.local" }).host).toBe("db.local");
  });
});

describe("compileZod — visibility-aware required", () => {
  const z = compileZod(schema);

  it("does NOT block when a required field is hidden", () => {
    const r = z.safeParse({ useSsh: false, port: 5432, email: "a@b.com", pw: "x", cpw: "x" });
    expect(r.success).toBe(true);
  });

  it("blocks when the same required field is visible and empty", () => {
    const r = z.safeParse({ useSsh: true, host: "", port: 5432, email: "a@b.com", pw: "x", cpw: "x" });
    expect(r.success).toBe(false);
    expect(r.success ? "" : r.error.issues[0].message).toBe("host required");
  });
});

describe("compileZod — value rules", () => {
  const z = compileZod(schema);

  it("enforces numeric max (with coercion)", () => {
    const r = z.safeParse({ useSsh: false, port: 70000, email: "a@b.com", pw: "x", cpw: "x" });
    expect(r.success).toBe(false);
  });

  it("treats empty number as undefined, not 0", () => {
    const r = z.safeParse({ useSsh: false, port: "", email: "a@b.com", pw: "x", cpw: "x" });
    expect(r.success).toBe(true);
  });

  it("validates email format", () => {
    const r = z.safeParse({ useSsh: false, email: "nope", pw: "x", cpw: "x" });
    expect(r.success).toBe(false);
  });

  it("enforces cross-field equals rule", () => {
    const r = z.safeParse({ useSsh: false, email: "a@b.com", pw: "a", cpw: "b" });
    expect(r.success).toBe(false);
    expect(r.success ? "" : r.error.issues[0].message).toBe("must match");
  });
});

describe("select with multiple flag (array-valued)", () => {
  const ms: FormSchema = {
    id: "ms",
    version: 1,
    fields: [
      {
        name: "tags",
        type: "select",
        multiple: true,
        options: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
          { value: "c", label: "C" },
        ],
        validation: {
          required: { message: "Pick at least one." },
          maxItems: { value: 2, message: "At most 2." },
        },
      },
    ],
  };

  it("defaults to an empty array", () => {
    expect(buildDefaults(ms).tags).toEqual([]);
  });

  it("accepts an array, rejects a bare string", () => {
    const z = compileZod(ms);
    expect(z.safeParse({ tags: ["a"] }).success).toBe(true);
    expect(z.safeParse({ tags: "a" }).success).toBe(false);
  });

  it("enforces maxItems and required", () => {
    const z = compileZod(ms);
    expect(z.safeParse({ tags: ["a", "b", "c"] }).success).toBe(false);
    expect(z.safeParse({ tags: [] }).success).toBe(false); // required
  });
});

describe("evaluateVisibility operators", () => {
  it("handles is / not / in / gt / notEmpty / all / any", () => {
    expect(evaluateVisibility({ field: "a", is: 1 }, { a: 1 })).toBe(true);
    expect(evaluateVisibility({ field: "a", not: 1 }, { a: 2 })).toBe(true);
    expect(evaluateVisibility({ field: "a", in: [1, 2] }, { a: 2 })).toBe(true);
    expect(evaluateVisibility({ field: "a", gt: 5 }, { a: 6 })).toBe(true);
    expect(evaluateVisibility({ field: "a", gt: 5 }, { a: 4 })).toBe(false);
    expect(evaluateVisibility({ field: "a", notEmpty: true }, { a: "" })).toBe(false);
    expect(
      evaluateVisibility({ all: [{ field: "a", is: 1 }, { field: "b", is: 2 }] }, { a: 1, b: 2 }),
    ).toBe(true);
    expect(
      evaluateVisibility({ any: [{ field: "a", is: 9 }, { field: "b", is: 2 }] }, { a: 1, b: 2 }),
    ).toBe(true);
  });
});

describe("validateSchema", () => {
  it("throws on duplicate field names", () => {
    const bad: FormSchema = { id: "x", version: 1, fields: [
      { name: "a", type: "text" }, { name: "a", type: "text" },
    ] };
    expect(() => validateSchema(bad)).toThrow(/Duplicate field name/);
  });

  it("throws on conditions referencing unknown fields", () => {
    const bad: FormSchema = { id: "x", version: 1, fields: [
      { name: "a", type: "text", visibleWhen: { field: "ghost", is: true } },
    ] };
    expect(() => validateSchema(bad)).toThrow(/unknown field "ghost"/);
  });

  it("accepts a valid schema", () => {
    expect(() => validateSchema(schema)).not.toThrow();
  });
});
