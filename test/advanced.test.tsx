import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormRender } from "../src/components/FormRender";
import { htmlComponents } from "../src/adapters/html";
import type { FormSchema, LoaderMap, ResolverMap } from "../src/types";

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("async validation (resolvers)", () => {
  const schema: FormSchema = {
    id: "async",
    version: 1,
    fields: [
      {
        name: "username",
        type: "text",
        label: "Username",
        asyncValidation: { resolver: "checkUser", debounceMs: 10 },
      },
    ],
  };

  it("shows a server-side error returned by the resolver on blur", async () => {
    const resolvers: ResolverMap = {
      checkUser: async (value) => (value === "taken" ? "Already taken" : null),
    };
    const user = userEvent.setup();
    render(
      <FormRender schema={schema} components={htmlComponents} resolvers={resolvers} onSubmit={vi.fn()} />,
    );
    await user.type(screen.getByLabelText("Username"), "taken");
    await user.tab(); // blur
    expect(await screen.findByText("Already taken")).toBeInTheDocument();
  });

  it("does not clear a sync (pattern) error when async passes", async () => {
    const withSync: FormSchema = {
      id: "async2",
      version: 1,
      settings: { validateOn: "onBlur" },
      fields: [
        {
          name: "cn",
          type: "text",
          label: "Name",
          validation: { pattern: { value: "^[A-Za-z0-9]+$", message: "No special chars." } },
          asyncValidation: { resolver: "ok", debounceMs: 10 },
        },
      ],
    };
    const resolvers: ResolverMap = { ok: async () => null }; // async always passes
    const user = userEvent.setup();
    render(<FormRender schema={withSync} components={htmlComponents} resolvers={resolvers} onSubmit={vi.fn()} />);
    await user.type(screen.getByLabelText("Name"), "wd-dsd"); // hyphen violates pattern
    await user.tab(); // blur → sync error + async scheduled
    expect(await screen.findByText("No special chars.")).toBeInTheDocument();
    await act(() => new Promise((r) => setTimeout(r, 60))); // let async resolve
    expect(screen.getByText("No special chars.")).toBeInTheDocument(); // sync error survives
  });

  it("clears when the resolver returns null", async () => {
    const resolvers: ResolverMap = {
      checkUser: async (value) => (value === "taken" ? "Already taken" : null),
    };
    const user = userEvent.setup();
    render(
      <FormRender schema={schema} components={htmlComponents} resolvers={resolvers} onSubmit={vi.fn()} />,
    );
    await user.type(screen.getByLabelText("Username"), "free");
    await user.tab();
    // let the debounced async validator settle inside act (it calls clearErrors)
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(screen.queryByText("Already taken")).not.toBeInTheDocument();
  });
});

describe("dynamic options (loaders)", () => {
  const schema: FormSchema = {
    id: "opts",
    version: 1,
    fields: [
      { name: "region", type: "select", label: "Region", optionsSource: { loader: "regions" } },
    ],
  };

  it("loads options from the injected loader", async () => {
    const loaders: LoaderMap = {
      regions: async () => [
        { value: "us", label: "United States" },
        { value: "eu", label: "Europe" },
      ],
    };
    render(<FormRender schema={schema} components={htmlComponents} loaders={loaders} onSubmit={vi.fn()} />);
    expect(await screen.findByRole("option", { name: "United States" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Europe" })).toBeInTheDocument();
  });
});

describe("number field with default", () => {
  const schema: FormSchema = {
    id: "num",
    version: 1,
    settings: { validateOn: "onBlur" },
    fields: [{ name: "port", type: "number", label: "Port", default: 5432 }],
  };

  it("can be cleared (does not revert to the default) and accepts a new value", async () => {
    const user = userEvent.setup();
    render(<FormRender schema={schema} components={htmlComponents} onSubmit={vi.fn()} />);
    const input = screen.getByLabelText(/Port/) as HTMLInputElement;
    expect(input.value).toBe("5432");
    await user.clear(input);
    expect(input.value).toBe(""); // must not snap back to 5432
    await user.type(input, "8080");
    expect(input.value).toBe("8080");
  });
});

describe("multiselect", () => {
  const schema: FormSchema = {
    id: "ms",
    version: 1,
    fields: [
      {
        name: "tags",
        type: "multiselect",
        label: "Tags",
        options: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
          { value: "c", label: "C" },
        ],
      },
    ],
    actions: [{ name: "save", type: "submit", text: "Save" }],
  };

  it("submits an array value (not a string)", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<FormRender schema={schema} components={htmlComponents} onSubmit={onSubmit} />);
    await user.selectOptions(screen.getByLabelText("Tags"), ["a", "c"]);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].tags).toEqual(["a", "c"]);
  });
});

describe("live error clearing (onBlur validates then clears on change)", () => {
  it("clears a field error on change after the first blur", async () => {
    const schema: FormSchema = {
      id: "live",
      version: 1,
      settings: { validateOn: "onBlur" },
      fields: [
        {
          name: "name",
          type: "text",
          label: "Name",
          validation: { minLength: { value: 3, message: "Too short." } },
        },
        { name: "other", type: "text", label: "Other" },
      ],
    };
    const user = userEvent.setup();
    render(<FormRender schema={schema} components={htmlComponents} onSubmit={vi.fn()} />);
    await user.type(screen.getByLabelText("Name"), "ab");
    await user.tab(); // blur → error appears
    expect(await screen.findByText("Too short.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Name"), "cde"); // now valid, on change
    await waitFor(() => expect(screen.queryByText("Too short.")).not.toBeInTheDocument());
  });
});

describe("disabledWhen", () => {
  const schema: FormSchema = {
    id: "dis",
    version: 1,
    fields: [
      { name: "lock", type: "checkbox", label: "Lock" },
      { name: "note", type: "text", label: "Note", disabledWhen: { field: "lock", is: true } },
    ],
  };

  it("disables a field when its condition is met", async () => {
    const user = userEvent.setup();
    render(<FormRender schema={schema} components={htmlComponents} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText("Note")).not.toBeDisabled();
    await user.click(screen.getByLabelText("Lock"));
    await waitFor(() => expect(screen.getByLabelText("Note")).toBeDisabled());
  });
});

describe("conditional steps", () => {
  const schema: FormSchema = {
    id: "cond-steps",
    version: 1,
    steps: [
      {
        id: "main",
        title: "Main",
        fields: [{ name: "advanced", type: "checkbox", label: "Advanced" }],
      },
      {
        id: "extra",
        title: "Extra",
        visibleWhen: { field: "advanced", is: true },
        fields: [{ name: "x", type: "text", label: "Extra Field" }],
      },
    ],
  };

  it("is single-step (Finish only) until the conditional step is enabled", async () => {
    const user = userEvent.setup();
    render(<FormRender schema={schema} components={htmlComponents} onSubmit={vi.fn()} />);
    // only one visible step → Submit/Finish shown, no Next
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();

    await user.click(screen.getByLabelText("Advanced"));
    // second step now exists → Next appears
    expect(await screen.findByRole("button", { name: "Next" })).toBeInTheDocument();
  });
});

describe("persistence", () => {
  const schema: FormSchema = {
    id: "persist-me",
    version: 1,
    settings: { persist: "session" },
    fields: [{ name: "draft", type: "text", label: "Draft" }],
  };

  it("restores a draft from sessionStorage on remount", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <FormRender schema={schema} components={htmlComponents} onSubmit={vi.fn()} />,
    );
    await user.type(screen.getByLabelText("Draft"), "hello world");
    await waitFor(() =>
      expect(window.sessionStorage.getItem("form-render:persist-me")).toContain("hello world"),
    );
    unmount();

    render(<FormRender schema={schema} components={htmlComponents} onSubmit={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText("Draft")).toHaveValue("hello world"));
  });
});
