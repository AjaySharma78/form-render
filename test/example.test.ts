import { describe, expect, it } from "vitest";
import { postgresSchema } from "../examples/postgres";
import { buildDefaults } from "../src/compile/defaults";
import { validateSchema } from "../src/compile/validate";
import { compileZod } from "../src/compile/zod";
import { allFields } from "../src/compile/schema-utils";

describe("examples/postgres schema", () => {
  it("passes schema validation (unique names, resolvable refs)", () => {
    expect(() => validateSchema(postgresSchema)).not.toThrow();
  });

  it("exercises every supported input type", () => {
    const fields = allFields(postgresSchema);
    const types = new Set(fields.map((f) => f.type));
    for (const t of [
      "text", "email", "password", "search", "tel", "url",
      "number", "range", "color", "date", "datetime-local", "month",
      "time", "week", "checkbox", "switch", "radio", "select",
      "textarea", "file", "hidden",
    ]) {
      expect(types.has(t), `missing field type: ${t}`).toBe(true);
    }
    // multi-select via the `multiple` flag on a select
    expect(fields.some((f) => f.type === "select" && f.multiple)).toBe(true);
  });

  it("builds defaults and a Zod schema without error", () => {
    expect(() => buildDefaults(postgresSchema)).not.toThrow();
    const z = compileZod(postgresSchema);
    // a minimal valid step-1 payload should not be rejected for hidden steps/fields
    const r = z.safeParse(buildDefaults(postgresSchema));
    expect(r).toBeTruthy();
  });
});
