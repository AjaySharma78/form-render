import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FormRender } from "../src/components/FormRender";
import { htmlComponents } from "../src/adapters/html";
import { applyMask, stripMask } from "../src/engine/mask";
import type { FormSchema, FormulaMap } from "../src/types";

function renderForm(schema: FormSchema, props: Record<string, unknown> = {}) {
  const onSubmit = vi.fn();
  render(
    <FormRender schema={schema} components={htmlComponents} onSubmit={onSubmit} {...props} />,
  );
  return { onSubmit, user: userEvent.setup() };
}

describe("edge fixes — option loaders", () => {
  it("a missing loader does not leave the select stuck disabled in Loading…", async () => {
    const schema: FormSchema = {
      id: "no-loader",
      version: 2,
      fields: [{ name: "city", type: "select", label: "City", optionsSource: { loader: "cities" } }],
    };
    renderForm(schema); // no loaders injected at all
    await waitFor(() =>
      expect(screen.getByLabelText("City") as HTMLSelectElement).not.toBeDisabled(),
    );
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it("parent change resets a required dependent field WITHOUT surfacing an error", async () => {
    const schema: FormSchema = {
      id: "dep-reset",
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
        },
        {
          name: "city",
          type: "select",
          label: "City",
          optionsSource: { loader: "cities", dependsOn: ["country"] },
          validation: { required: { message: "City is required" } },
        },
      ],
    };
    const { user } = renderForm(schema, {
      loaders: { cities: async () => [{ value: "x", label: "X" }] },
    });
    await user.selectOptions(screen.getByLabelText("Country"), "IN");
    // the child was emptied but must not show its required error yet
    await waitFor(() => expect(screen.getByLabelText(/City/)).not.toBeDisabled());
    expect(screen.queryByText("City is required")).not.toBeInTheDocument();
  });
});

describe("edge fixes — editable computed restore", () => {
  const mul: FormulaMap = { mul: ({ a, b }) => (Number(a) || 0) * (Number(b) || 0) };
  const schema: FormSchema = {
    id: "editable-computed",
    version: 2,
    fields: [
      { name: "a", type: "number", label: "A", default: 2 },
      { name: "b", type: "number", label: "B", default: 5 },
      {
        name: "total",
        type: "number",
        label: "Total",
        editable: true,
        computed: { formula: "mul", inputs: ["a", "b"] },
      },
    ],
  };

  it("a restored manual override survives mount (no derivation clobber)", async () => {
    renderForm(schema, { formulas: mul, defaultValues: { total: 999 } });
    // 999 (the restored override) must not be replaced by 2*5
    await new Promise((r) => setTimeout(r, 50));
    expect((screen.getByLabelText("Total") as HTMLInputElement).value).toBe("999");
  });

  it("an input change after mount still recomputes over the override", async () => {
    const { user } = renderForm(schema, { formulas: mul, defaultValues: { total: 999 } });
    const a = screen.getByLabelText("A");
    await user.clear(a);
    await user.type(a, "7");
    await waitFor(() =>
      expect((screen.getByLabelText("Total") as HTMLInputElement).value).toBe("35"),
    );
  });

  it("non-editable computed fields still derive on mount", async () => {
    const plain: FormSchema = {
      ...schema,
      fields: schema.fields!.map((f) => (f.name === "total" ? { ...f, editable: undefined } : f)),
    };
    renderForm(plain, { formulas: mul });
    await waitFor(() =>
      expect((screen.getByLabelText("Total") as HTMLInputElement).value).toBe("10"),
    );
  });
});

describe("edge fixes — masks with alphanumeric literals", () => {
  it("stripMask consumes literals as formatting, not data", () => {
    expect(stripMask("PO-1234", "PO-9999")).toBe("1234");
    expect(stripMask(applyMask("1234", "PO-9999"), "PO-9999")).toBe("1234"); // round-trip
    expect(applyMask("1234", "PO-9999")).toBe("PO-1234");
    expect(stripMask("50 kg", "999 kg")).toBe("50");
    // classic non-alphanumeric literals keep working
    expect(stripMask("(123) 456-7890", "(999) 999-9999")).toBe("1234567890");
    expect(stripMask("12345678901111", "(999) 999-9999")).toBe("1234567890"); // capped
    // partial input mid-typing
    expect(stripMask("PO-12", "PO-9999")).toBe("12");
    expect(stripMask("12", "PO-9999")).toBe("12");
  });
});
