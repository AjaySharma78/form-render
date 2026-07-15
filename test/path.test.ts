import { describe, expect, it } from "vitest";
import { validateSchema } from "../src/compile/validate";
import { compileZod } from "../src/compile/zod";
import { evaluateCondition, evaluateVisibility } from "../src/engine/condition";
import { getPath, setPath } from "../src/engine/path";
import type { FormSchema } from "../src/types";

describe("getPath", () => {
  it("reads flat keys", () => {
    expect(getPath({ a: 1 }, "a")).toBe(1);
  });

  it("prefers a literal (dotted) key over a nested walk", () => {
    // scoped useWatch builds objects keyed by the literal dep string
    expect(getPath({ "a.b": "flat", a: { b: "nested" } }, "a.b")).toBe("flat");
  });

  it("walks nested objects and array indices", () => {
    const values = { contacts: [{ name: "Ada" }, { name: "Grace" }] };
    expect(getPath(values, "contacts.0.name")).toBe("Ada");
    expect(getPath(values, "contacts.1.name")).toBe("Grace");
  });

  it("returns undefined for missing paths and null bases", () => {
    expect(getPath({ a: { b: 1 } }, "a.c.d")).toBeUndefined();
    expect(getPath({ a: null }, "a.b")).toBeUndefined();
    expect(getPath(undefined, "a")).toBeUndefined();
    expect(getPath({ a: "str" }, "a.b")).toBeUndefined();
  });
});

describe("setPath", () => {
  it("sets flat keys", () => {
    const o: Record<string, unknown> = {};
    setPath(o, "a", 1);
    expect(o).toEqual({ a: 1 });
  });

  it("creates intermediate objects", () => {
    const o: Record<string, unknown> = {};
    setPath(o, "address.street", "Main St");
    expect(o).toEqual({ address: { street: "Main St" } });
  });

  it("creates arrays for numeric segments", () => {
    const o: Record<string, unknown> = {};
    setPath(o, "contacts.0.name", "Ada");
    expect(Array.isArray(o.contacts)).toBe(true);
    expect(o).toEqual({ contacts: [{ name: "Ada" }] });
  });

  it("preserves existing siblings", () => {
    const o: Record<string, unknown> = { address: { city: "Pune" } };
    setPath(o, "address.street", "Main St");
    expect(o).toEqual({ address: { city: "Pune", street: "Main St" } });
  });
});

describe("conditions over nested values", () => {
  it("evaluateCondition resolves dot paths into nested values", () => {
    const values = { contacts: [{ isPrimary: true }] };
    expect(evaluateCondition({ field: "contacts.0.isPrimary", is: true }, values)).toBe(true);
    expect(evaluateCondition({ field: "contacts.0.isPrimary", is: false }, values)).toBe(false);
  });

  it("evaluateVisibility trees work over nested values", () => {
    const values = { user: { role: "admin", age: 30 } };
    expect(
      evaluateVisibility(
        { all: [{ field: "user.role", is: "admin" }, { field: "user.age", gte: 18 }] },
        values,
      ),
    ).toBe(true);
  });
});

describe("validateSchema — v2 name rules", () => {
  it("rejects field names containing dots", () => {
    const bad: FormSchema = {
      id: "x",
      version: 1,
      fields: [{ name: "a.b", type: "text" }],
    };
    expect(() => validateSchema(bad)).toThrow(/must not contain "\."/);
  });
});

describe("unified *When trees (v2)", () => {
  const schema: FormSchema = {
    id: "w",
    version: 1,
    fields: [
      { name: "role", type: "select", options: [{ value: "admin", label: "Admin" }] },
      { name: "age", type: "number" },
      {
        name: "reason",
        type: "text",
        // v1 only allowed a single flat condition here — v2 accepts full trees
        requiredWhen: { any: [{ field: "role", is: "admin" }, { field: "age", gte: 65 }] },
      },
    ],
  };

  it("requiredWhen accepts an `any` tree", () => {
    const z = compileZod(schema);
    expect(z.safeParse({ role: "admin", age: 30, reason: "" }).success).toBe(false);
    expect(z.safeParse({ role: "", age: 70, reason: "" }).success).toBe(false);
    expect(z.safeParse({ role: "", age: 30, reason: "" }).success).toBe(true);
    expect(z.safeParse({ role: "admin", age: 30, reason: "because" }).success).toBe(true);
  });

  it("requiredIf rule accepts a tree", () => {
    const withRule: FormSchema = {
      ...schema,
      fields: schema.fields!.map((f) => (f.name === "reason" ? { ...f, requiredWhen: undefined } : f)),
      rules: [
        {
          type: "requiredIf",
          field: "reason",
          when: { all: [{ field: "role", is: "admin" }, { field: "age", gt: 0 }] },
          path: "reason",
          message: "reason required",
        },
      ],
    };
    const z = compileZod(withRule);
    const fail = z.safeParse({ role: "admin", age: 1, reason: "" });
    expect(fail.success).toBe(false);
    expect(z.safeParse({ role: "", age: 1, reason: "" }).success).toBe(true);
  });
});
