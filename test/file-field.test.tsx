import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FormRender } from "../src/components/FormRender";
import { htmlComponents } from "../src/adapters/html";
import type { Field, FormSchema } from "../src/types";

const file = (name: string, type = "text/plain") => new File(["x"], name, { type });

function setup(field: Field) {
  const schema: FormSchema = { id: "f", version: 1, fields: [field] };
  render(<FormRender schema={schema} components={htmlComponents} onSubmit={vi.fn()} />);
  return userEvent.setup();
}

describe("html adapter — FileInput", () => {
  it("single: shows the selected file, and a second selection replaces it", async () => {
    const user = setup({ name: "doc", type: "file", label: "Document" });
    const input = screen.getByLabelText("Document") as HTMLInputElement;

    await user.upload(input, file("a.txt"));
    expect(screen.getByText("a.txt")).toBeInTheDocument();

    await user.upload(input, file("b.txt"));
    expect(screen.queryByText("a.txt")).not.toBeInTheDocument();
    expect(screen.getByText("b.txt")).toBeInTheDocument();
  });

  it("multiple: appends across selections instead of replacing", async () => {
    const user = setup({ name: "docs", type: "file", label: "Docs", multiple: true });
    const input = screen.getByLabelText("Docs") as HTMLInputElement;

    await user.upload(input, [file("a.txt"), file("b.txt")]);
    expect(screen.getByText("a.txt")).toBeInTheDocument();
    expect(screen.getByText("b.txt")).toBeInTheDocument();

    await user.upload(input, file("c.txt"));
    expect(screen.getByText("a.txt")).toBeInTheDocument(); // kept
    expect(screen.getByText("c.txt")).toBeInTheDocument(); // appended
  });

  it("removes a selected file via its remove button", async () => {
    const user = setup({ name: "docs", type: "file", label: "Docs", multiple: true });
    const input = screen.getByLabelText("Docs") as HTMLInputElement;

    await user.upload(input, [file("a.txt"), file("b.txt")]);
    await user.click(screen.getByLabelText("Remove a.txt"));

    expect(screen.queryByText("a.txt")).not.toBeInTheDocument();
    expect(screen.getByText("b.txt")).toBeInTheDocument();
  });

  it("caps multiple selection at validation.maxFiles", async () => {
    const user = setup({
      name: "docs",
      type: "file",
      label: "Docs",
      multiple: true,
      validation: { maxFiles: { value: 2, message: "too many" } },
    });
    const input = screen.getByLabelText("Docs") as HTMLInputElement;

    await user.upload(input, [file("a.txt"), file("b.txt"), file("c.txt")]);
    expect(screen.getByText("a.txt")).toBeInTheDocument();
    expect(screen.getByText("b.txt")).toBeInTheDocument();
    expect(screen.queryByText("c.txt")).not.toBeInTheDocument();
  });
});

describe("file fields + persistence", () => {
  beforeEach(() => window.sessionStorage.clear());

  const persistSchema: FormSchema = {
    id: "persist-files",
    version: 1,
    settings: { persist: "session" },
    fields: [{ name: "docs", type: "file", label: "Docs", multiple: true }],
  };

  it("does not write File objects to storage (they'd restore as broken {})", async () => {
    render(<FormRender schema={persistSchema} components={htmlComponents} onSubmit={vi.fn()} />);
    const user = userEvent.setup();

    await user.upload(screen.getByLabelText("Docs") as HTMLInputElement, [file("a.txt"), file("b.txt")]);

    const saved = JSON.parse(window.sessionStorage.getItem("form-render:persist-files") ?? "{}");
    // Files are stripped, not serialized to empty objects.
    expect(saved.docs).toEqual([]);
  });

  it("ignores a corrupt restored draft instead of rendering NaN-MB phantom rows", () => {
    // simulate a draft saved before the fix: File[] became [{}, {}]
    window.sessionStorage.setItem("form-render:persist-files", JSON.stringify({ docs: [{}, {}] }));

    render(<FormRender schema={persistSchema} components={htmlComponents} onSubmit={vi.fn()} />);

    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Remove/)).not.toBeInTheDocument();
  });
});
