import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FormRender } from "../src/components/FormRender";
import { htmlComponents } from "../src/adapters/html";
import type { FormSchema } from "../src/types";

function renderForm(schema: FormSchema, onSubmit = vi.fn()) {
  render(<FormRender schema={schema} components={htmlComponents} onSubmit={onSubmit} />);
  return { onSubmit, user: userEvent.setup() };
}

describe("FormRender — rendering & conditional fields", () => {
  const schema: FormSchema = {
    id: "f",
    version: 1,
    fields: [
      { name: "enable", type: "checkbox", label: "Enable" },
      {
        name: "email",
        type: "text",
        label: "Email",
        visibleWhen: { field: "enable", is: true },
        validation: { required: { message: "Email is required" } },
      },
    ],
  };

  it("renders labels and hides conditional fields initially", () => {
    renderForm(schema);
    expect(screen.getByText("Enable")).toBeInTheDocument();
    expect(screen.queryByText("Email")).not.toBeInTheDocument();
  });

  it("reveals the conditional field when the checkbox is ticked", async () => {
    const { user } = renderForm(schema);
    await user.click(screen.getByLabelText("Enable"));
    expect(await screen.findByText(/Email/)).toBeInTheDocument();
  });
});

describe("FormRender — explicit layout rows", () => {
  const schema: FormSchema = {
    id: "layout",
    version: 1,
    fields: [
      { name: "a", type: "text", label: "A" },
      { name: "b", type: "text", label: "B" },
      { name: "solo", type: "text", label: "Solo" },
    ],
    layout: [["a", "b"], ["solo"]],
  };

  it("splits a two-field row 6/6 and gives a single-field row full width", () => {
    const { container } = render(
      <FormRender schema={schema} components={htmlComponents} onSubmit={vi.fn()} />,
    );
    const cellOf = (name: string) =>
      (container.querySelector(`[data-field="${name}"]`)!.parentElement as HTMLElement).style
        .gridColumn;
    expect(cellOf("a")).toBe("span 6");
    expect(cellOf("b")).toBe("span 6");
    expect(cellOf("solo")).toBe("span 12");
  });

  it("honors an explicit layout inside a section", () => {
    const sectioned: FormSchema = {
      id: "sec",
      version: 1,
      fields: [
        { name: "a", type: "text", label: "A" },
        { name: "b", type: "text", label: "B" },
        { name: "c", type: "text", label: "C" },
      ],
      sections: [
        { id: "s", title: "S", fields: ["a", "b", "c"], layout: [["a", "b"], ["c"]] },
      ],
    };
    const { container } = render(
      <FormRender schema={sectioned} components={htmlComponents} onSubmit={vi.fn()} />,
    );
    const cellOf = (name: string) =>
      (container.querySelector(`[data-field="${name}"]`)!.parentElement as HTMLElement).style
        .gridColumn;
    expect(cellOf("a")).toBe("span 6");
    expect(cellOf("b")).toBe("span 6");
    expect(cellOf("c")).toBe("span 12");
  });
});

describe("FormRender — validation & submit", () => {
  const schema: FormSchema = {
    id: "f",
    version: 1,
    fields: [
      {
        name: "name",
        type: "text",
        label: "Name",
        validation: { required: { message: "Name is required" } },
      },
    ],
    actions: [{ name: "save", type: "submit", text: "Save" }],
  };

  it("blocks submit and shows the error for an empty required field", async () => {
    const { onSubmit, user } = renderForm(schema);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits values when valid", async () => {
    const { onSubmit, user } = renderForm(schema);
    await user.type(screen.getByLabelText(/Name/), "Ada");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: "Ada" });
  });
});

describe("FormRender — gated multi-step navigation", () => {
  const schema: FormSchema = {
    id: "wiz",
    version: 1,
    settings: { stepValidation: "gated" },
    steps: [
      {
        id: "one",
        title: "Step One",
        fields: [
          {
            name: "first",
            type: "text",
            label: "First",
            validation: { required: { message: "First is required" } },
          },
        ],
      },
      {
        id: "two",
        title: "Step Two",
        fields: [{ name: "second", type: "text", label: "Second" }],
      },
    ],
  };

  it("does not advance to step two until step one validates", async () => {
    const { user } = renderForm(schema);
    expect(screen.getByLabelText(/First/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Second/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    // still on step one, error shown
    expect(await screen.findByText("First is required")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Second/)).not.toBeInTheDocument();

    // fill and advance
    await user.type(screen.getByLabelText(/First/), "hello");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByLabelText(/Second/)).toBeInTheDocument();
  });
});
