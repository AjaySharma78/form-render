import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FormRender } from "../src/components/FormRender";
import { htmlComponents } from "../src/adapters/html";
import { validateSchema } from "../src/compile/validate";
import type { FormSchema, FormulaMap } from "../src/types";

function renderForm(schema: FormSchema, formulas: FormulaMap, props: Record<string, unknown> = {}) {
  const onSubmit = vi.fn();
  render(
    <FormRender
      schema={schema}
      components={htmlComponents}
      formulas={formulas}
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return { onSubmit, user: userEvent.setup() };
}

const mul: FormulaMap = { mul: ({ a, b }) => (Number(a) || 0) * (Number(b) || 0) };

const totalSchema: FormSchema = {
  id: "calc",
  version: 2,
  fields: [
    { name: "a", type: "number", label: "A", default: 2 },
    { name: "b", type: "number", label: "B", default: 5 },
    { name: "total", type: "number", label: "Total", computed: { formula: "mul", inputs: ["a", "b"] } },
  ],
};

describe("computed fields", () => {
  it("derives the initial value on mount", async () => {
    renderForm(totalSchema, mul);
    await waitFor(() =>
      expect((screen.getByLabelText("Total") as HTMLInputElement).value).toBe("10"),
    );
  });

  it("recomputes when an input changes", async () => {
    const { user } = renderForm(totalSchema, mul);
    const a = screen.getByLabelText("A");
    await user.clear(a);
    await user.type(a, "7");
    await waitFor(() =>
      expect((screen.getByLabelText("Total") as HTMLInputElement).value).toBe("35"),
    );
  });

  it("renders read-only (disabled) by default", async () => {
    renderForm(totalSchema, mul);
    await waitFor(() => expect(screen.getByLabelText("Total")).toBeDisabled());
  });

  it("stays editable with editable: true", async () => {
    const editable: FormSchema = {
      ...totalSchema,
      fields: totalSchema.fields!.map((f) =>
        f.name === "total" ? { ...f, editable: true } : f,
      ),
    };
    renderForm(editable, mul);
    await waitFor(() => expect(screen.getByLabelText("Total")).not.toBeDisabled());
  });

  it("computes per-row inside arrays, mixing row inputs and $. root inputs", async () => {
    const invoice: FormSchema = {
      id: "inv",
      version: 2,
      fields: [
        { name: "taxRate", type: "number", label: "Tax", default: 10 },
        {
          name: "items",
          type: "array",
          addText: "Add item",
          defaultItems: 2,
          item: {
            fields: [
              { name: "qty", type: "number", label: "Qty", default: 1 },
              {
                name: "gross",
                type: "number",
                label: "Gross",
                computed: { formula: "gross", inputs: ["qty", "$.taxRate"] },
              },
            ],
          },
        },
      ],
    };
    const formulas: FormulaMap = {
      gross: (inputs) =>
        Math.round(
          (Number(inputs["qty"]) || 0) * (1 + (Number(inputs["$.taxRate"]) || 0) / 100) * 100,
        ) / 100,
    };
    const { user } = renderForm(invoice, formulas);

    const grosses = () => screen.getAllByLabelText("Gross") as HTMLInputElement[];
    await waitFor(() => expect(grosses().map((g) => g.value)).toEqual(["1.1", "1.1"]));

    // change qty in row 2 only → only row 2 recomputes
    const qty2 = (screen.getAllByLabelText("Qty") as HTMLInputElement[])[1]!;
    await user.clear(qty2);
    await user.type(qty2, "3");
    await waitFor(() => expect(grosses().map((g) => g.value)).toEqual(["1.1", "3.3"]));

    // root input change → every row recomputes
    const tax = screen.getByLabelText("Tax");
    await user.clear(tax);
    await user.type(tax, "0");
    await waitFor(() => expect(grosses().map((g) => g.value)).toEqual(["1", "3"]));
  });
});

describe("effects (reactions)", () => {
  const geo: FormSchema = {
    id: "geo",
    version: 2,
    fields: [
      {
        name: "country",
        type: "select",
        label: "Country",
        options: [
          { value: "US", label: "US" },
          { value: "IN", label: "IN" },
        ],
        effects: [
          { when: { field: "country", notEmpty: true }, set: { state: "" } },
          { when: { field: "country", is: "US" }, set: { currency: "USD" } },
          { when: { field: "country", is: "IN" }, set: { currency: "INR" } },
        ],
      },
      { name: "state", type: "text", label: "State" },
      { name: "currency", type: "text", label: "Currency" },
    ],
  };

  it("does not fire on mount", () => {
    renderForm(geo, {}, { defaultValues: { country: "US", state: "CA", currency: "" } });
    expect((screen.getByLabelText("State") as HTMLInputElement).value).toBe("CA");
    expect((screen.getByLabelText("Currency") as HTMLInputElement).value).toBe("");
  });

  it("clears dependents and applies conditional sets on change", async () => {
    const { user } = renderForm(geo, {});
    await user.type(screen.getByLabelText("State"), "CA");
    await user.selectOptions(screen.getByLabelText("Country"), "IN");
    await waitFor(() => {
      expect((screen.getByLabelText("State") as HTMLInputElement).value).toBe("");
      expect((screen.getByLabelText("Currency") as HTMLInputElement).value).toBe("INR");
    });

    await user.selectOptions(screen.getByLabelText("Country"), "US");
    await waitFor(() =>
      expect((screen.getByLabelText("Currency") as HTMLInputElement).value).toBe("USD"),
    );
  });
});

describe("validateSchema — computed/effects", () => {
  it("rejects unknown computed inputs and effect targets", () => {
    const badInput: FormSchema = {
      id: "b1",
      version: 2,
      fields: [{ name: "t", type: "number", computed: { formula: "f", inputs: ["ghost"] } }],
    };
    expect(() => validateSchema(badInput)).toThrow(/unknown field "ghost"/);

    const badTarget: FormSchema = {
      id: "b2",
      version: 2,
      fields: [
        { name: "a", type: "text", effects: [{ when: { field: "a", notEmpty: true }, set: { ghost: 1 } }] },
      ],
    };
    expect(() => validateSchema(badTarget)).toThrow(/unknown field "ghost"/);
  });

  it("rejects computed cycles", () => {
    const cyclic: FormSchema = {
      id: "cy",
      version: 2,
      fields: [
        { name: "a", type: "number", computed: { formula: "f", inputs: ["b"] } },
        { name: "b", type: "number", computed: { formula: "g", inputs: ["a"] } },
      ],
    };
    expect(() => validateSchema(cyclic)).toThrow(/cycle/i);
  });

  it("rejects effect→computed loops but accepts DAGs", () => {
    const loop: FormSchema = {
      id: "lp",
      version: 2,
      fields: [
        {
          name: "a",
          type: "number",
          computed: { formula: "f", inputs: ["b"] },
          effects: [{ when: { field: "a", gt: 0 }, set: { b: 1 } }],
        },
        { name: "b", type: "number" },
      ],
    };
    expect(() => validateSchema(loop)).toThrow(/cycle/i);

    const dag: FormSchema = {
      id: "ok",
      version: 2,
      fields: [
        { name: "a", type: "number" },
        { name: "b", type: "number", computed: { formula: "f", inputs: ["a"] } },
        { name: "c", type: "number", computed: { formula: "g", inputs: ["a", "b"] } },
      ],
    };
    expect(() => validateSchema(dag)).not.toThrow();
  });
});
