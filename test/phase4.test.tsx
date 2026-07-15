import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FormRender } from "../src/components/FormRender";
import { htmlComponents } from "../src/adapters/html";
import { applyMask, stripMask } from "../src/engine/mask";
import { coerceByType } from "../src/engine/coerce";
import type { FormSchema } from "../src/types";

function renderForm(schema: FormSchema, props: Record<string, unknown> = {}) {
  const onSubmit = vi.fn();
  const utils = render(
    <FormRender schema={schema} components={htmlComponents} onSubmit={onSubmit} {...props} />,
  );
  return { onSubmit, user: userEvent.setup(), ...utils };
}

// ── 4.3 mask ─────────────────────────────────────────────────────────────

describe("mask", () => {
  it("applyMask / stripMask round-trip", () => {
    expect(applyMask("1234567890", "(999) 999-9999")).toBe("(123) 456-7890");
    expect(applyMask("12", "(999) 999-9999")).toBe("(12");
    expect(applyMask("AB12", "aa-99")).toBe("AB-12");
    expect(applyMask("A1B2", "aa-99")).toBe("AB-2"); // chars invalid for a slot are dropped
    expect(stripMask("(123) 456-7890", "(999) 999-9999")).toBe("1234567890");
    expect(stripMask("12345678901111", "(999) 999-9999")).toBe("1234567890"); // capped
  });

  it("displays masked, stores raw, submits raw", async () => {
    const schema: FormSchema = {
      id: "m",
      version: 2,
      fields: [{ name: "phone", type: "tel", label: "Phone", mask: "(999) 999-9999" }],
    };
    const { onSubmit, user } = renderForm(schema);
    const input = screen.getByLabelText("Phone") as HTMLInputElement;
    await user.type(input, "1234567890");
    expect(input.value).toBe("(123) 456-7890");

    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].phone).toBe("1234567890");
  });
});

// ── 4.3 tooltip + columns ────────────────────────────────────────────────

describe("tooltip & columns", () => {
  it("renders field.tooltip on the label", () => {
    const schema: FormSchema = {
      id: "tt",
      version: 2,
      fields: [{ name: "a", type: "text", label: "A", tooltip: "Helpful hint" }],
    };
    renderForm(schema);
    expect(screen.getByLabelText("Helpful hint")).toBeInTheDocument();
  });

  it("settings.columns drives the grid", () => {
    const schema: FormSchema = {
      id: "cols",
      version: 2,
      settings: { columns: 6 },
      fields: [
        { name: "a", type: "text", label: "A", width: "half" },
        { name: "b", type: "text", label: "B" },
      ],
    };
    const { container } = renderForm(schema);
    const grid = container.querySelector(".fr-grid") as HTMLElement;
    expect(grid.style.gridTemplateColumns).toContain("repeat(6");
    const cellOf = (name: string) =>
      (container.querySelector(`[data-field="${name}"]`)!.parentElement as HTMLElement).style
        .gridColumn;
    expect(cellOf("a")).toBe("span 3"); // half of 6
    expect(cellOf("b")).toBe("span 6"); // full
  });
});

// ── 4.1 a11y ─────────────────────────────────────────────────────────────

describe("a11y wiring", () => {
  const schema: FormSchema = {
    id: "a11y",
    version: 2,
    fields: [
      {
        name: "email",
        type: "email",
        label: "Email",
        description: "Work address preferred",
        validation: { required: { message: "Email required" } },
      },
      {
        name: "color",
        type: "radio",
        label: "Color",
        options: [
          { value: "r", label: "Red" },
          { value: "g", label: "Green" },
        ],
      },
    ],
  };

  it("wires aria-describedby to description and error nodes, and aria-invalid", async () => {
    const { user, container } = renderForm(schema);
    const input = screen.getByLabelText(/Email/);
    expect(input).toHaveAttribute("aria-describedby", "email-description");
    expect(container.querySelector("#email-description")).toHaveTextContent(
      "Work address preferred",
    );

    await user.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByText("Email required");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toBe("email-description email-error");
    expect(container.querySelector("#email-error")).toHaveTextContent("Email required");
  });

  it("radio group is labelled and its label focuses the first radio", () => {
    renderForm(schema);
    const group = screen.getByRole("radiogroup", { name: "Color" });
    expect(group).toBeInTheDocument();
    // wrapper label htmlFor resolves to the first radio input
    const first = document.getElementById("color") as HTMLInputElement;
    expect(first).toBeTruthy();
    expect(first.type).toBe("radio");
  });
});

// ── 4.2 wizard ───────────────────────────────────────────────────────────

const wizard: FormSchema = {
  id: "wiz4",
  version: 2,
  settings: { stepValidation: "free" },
  steps: [
    { id: "one", title: "One", fields: [{ name: "first", type: "text", label: "First" }] },
    { id: "two", title: "Two", fields: [{ name: "second", type: "text", label: "Second" }] },
    { id: "rev", title: "Confirm", review: true, fields: [] },
  ],
};

describe("wizard upgrades", () => {
  it("fires onStepChange with direction and supports clickable visited chips", async () => {
    const onStepChange = vi.fn();
    const { user } = renderForm(wizard, { onStepChange });

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onStepChange).toHaveBeenLastCalledWith(1, "next");

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(onStepChange).toHaveBeenLastCalledWith(0, "back");

    // step 2's chip is visited → clickable
    await user.click(screen.getByRole("button", { name: "Two" }));
    expect(onStepChange).toHaveBeenLastCalledWith(1, "jump");
    expect(screen.getByLabelText("Second")).toBeInTheDocument();
  });

  it("renders a review step summarising values with Edit links", async () => {
    const { user } = renderForm(wizard);
    await user.type(screen.getByLabelText("First"), "Ada");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.type(screen.getByLabelText("Second"), "Lovelace");
    await user.click(screen.getByRole("button", { name: "Next" }));

    // review shows both groups + values
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("Lovelace")).toBeInTheDocument();

    // Edit jumps back to that step
    const edits = screen.getAllByRole("button", { name: "Edit" });
    await user.click(edits[0]!);
    expect(screen.getByLabelText("First")).toBeInTheDocument();
  });

  it("supports a controlled step index", async () => {
    const onStepRequest = vi.fn();
    const { user } = renderForm(wizard, { step: 1, onStepRequest });
    expect(screen.getByLabelText("Second")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onStepRequest).toHaveBeenCalledWith(2);
    // state is controlled — without a prop update the form stays on step 2
    expect(screen.getByLabelText("Second")).toBeInTheDocument();
  });
});

// ── 4.4 small fixes ──────────────────────────────────────────────────────

describe("small fixes", () => {
  it("numeric select options submit as numbers", async () => {
    const schema: FormSchema = {
      id: "num-sel",
      version: 2,
      fields: [
        {
          name: "count",
          type: "select",
          label: "Count",
          options: [
            { value: 1, label: "One" },
            { value: 2, label: "Two" },
          ],
        },
      ],
    };
    const { onSubmit, user } = renderForm(schema);
    await user.selectOptions(screen.getByLabelText("Count"), "2");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].count).toBe(2);
  });

  it("coerceByType maps multiselect values through declared options", () => {
    const field = {
      name: "ns",
      type: "multiselect",
      options: [
        { value: 1, label: "1" },
        { value: 2, label: "2" },
      ],
    } as const;
    expect(coerceByType(field, ["1", "2"])).toEqual([1, 2]);
  });

  it("hiddenValues: keep — value survives hide/show but is stripped from submit", async () => {
    const schema: FormSchema = {
      id: "keep",
      version: 2,
      settings: { hiddenValues: "keep" },
      fields: [
        { name: "toggle", type: "checkbox", label: "Toggle" },
        {
          name: "extra",
          type: "text",
          label: "Extra",
          visibleWhen: { field: "toggle", is: true },
        },
      ],
    };
    const { onSubmit, user } = renderForm(schema);
    await user.click(screen.getByLabelText("Toggle")); // show
    await user.type(screen.getByLabelText("Extra"), "kept");
    await user.click(screen.getByLabelText("Toggle")); // hide
    await user.click(screen.getByLabelText("Toggle")); // show again
    expect((screen.getByLabelText("Extra") as HTMLInputElement).value).toBe("kept");

    await user.click(screen.getByLabelText("Toggle")); // hide before submit
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("extra");
  });

  it("interpolates {value} in validation messages", async () => {
    const schema: FormSchema = {
      id: "interp",
      version: 2,
      fields: [
        {
          name: "code",
          type: "text",
          label: "Code",
          validation: { minLength: { value: 5, message: "Need at least {value} characters" } },
        },
      ],
    };
    const { user } = renderForm(schema);
    await user.type(screen.getByLabelText("Code"), "abc");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText("Need at least 5 characters")).toBeInTheDocument();
  });
});
