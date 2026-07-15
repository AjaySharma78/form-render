import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FormRender } from "../src/components/FormRender";
import { htmlComponents } from "../src/adapters/html";
import { validateSchema } from "../src/compile/validate";
import { compileZod } from "../src/compile/zod";
import { evaluateCondition } from "../src/engine/condition";
import type { FormSchema } from "../src/types";

// ── 3.2 condition operators ──────────────────────────────────────────────

describe("condition operators (v2)", () => {
  it("isEmpty / matches / contains / containsAny", () => {
    expect(evaluateCondition({ field: "a", isEmpty: true }, { a: "" })).toBe(true);
    expect(evaluateCondition({ field: "a", isEmpty: true }, { a: "x" })).toBe(false);
    expect(evaluateCondition({ field: "a", matches: "^\\d{4}$" }, { a: "2026" })).toBe(true);
    expect(evaluateCondition({ field: "a", matches: "^\\d{4}$" }, { a: "20x6" })).toBe(false);
    expect(evaluateCondition({ field: "tags", contains: "b" }, { tags: ["a", "b"] })).toBe(true);
    expect(evaluateCondition({ field: "tags", contains: "z" }, { tags: ["a", "b"] })).toBe(false);
    expect(evaluateCondition({ field: "tags", containsAny: ["z", "a"] }, { tags: ["a"] })).toBe(true);
    expect(evaluateCondition({ field: "tags", containsAny: ["z"] }, { tags: ["a"] })).toBe(false);
  });

  it("$field compares against another field", () => {
    expect(evaluateCondition({ field: "end", gt: { $field: "start" } }, { start: 1, end: 5 })).toBe(true);
    expect(evaluateCondition({ field: "end", gt: { $field: "start" } }, { start: 5, end: 1 })).toBe(false);
    expect(evaluateCondition({ field: "b", is: { $field: "a" } }, { a: "x", b: "x" })).toBe(true);
    expect(evaluateCondition({ field: "b", not: { $field: "a" } }, { a: "x", b: "y" })).toBe(true);
  });

  it("validateSchema flags unknown $field refs and invalid regexes", () => {
    const badRef: FormSchema = {
      id: "b",
      version: 2,
      fields: [
        { name: "end", type: "number", visibleWhen: { field: "end", gt: { $field: "ghost" } } },
      ],
    };
    expect(() => validateSchema(badRef)).toThrow(/unknown field "ghost"/);

    const badRegex: FormSchema = {
      id: "r",
      version: 2,
      fields: [{ name: "a", type: "text", visibleWhen: { field: "a", matches: "(" } }],
    };
    expect(() => validateSchema(badRegex)).toThrow(/invalid `matches` regex/);
  });
});

// ── 3.3 custom cross-field rules ─────────────────────────────────────────

describe("custom cross-field rules", () => {
  const schema: FormSchema = {
    id: "cr",
    version: 2,
    rules: [{ type: "custom", validator: "sumIs100", path: "b", message: "Must sum to 100" }],
    fields: [
      { name: "a", type: "number" },
      { name: "b", type: "number" },
    ],
  };

  it("fails when the injected validator returns false", () => {
    const z = compileZod(schema, undefined, {
      sumIs100: (v) => (Number(v.a) || 0) + (Number(v.b) || 0) === 100,
    });
    const bad = z.safeParse({ a: 40, b: 40 });
    expect(bad.success).toBe(false);
    expect(bad.success ? "" : bad.error.issues[0]?.message).toBe("Must sum to 100");
    expect(z.safeParse({ a: 40, b: 60 }).success).toBe(true);
  });

  it("is skipped when the validator is not injected", () => {
    const z = compileZod(schema);
    expect(z.safeParse({ a: 1, b: 2 }).success).toBe(true);
  });
});

// ── 3.1 async validation at submit ───────────────────────────────────────

describe("async validation at submit", () => {
  const schema: FormSchema = {
    id: "as",
    version: 2,
    fields: [
      {
        name: "username",
        type: "text",
        label: "Username",
        asyncValidation: { resolver: "checkName", debounceMs: 10 },
      },
    ],
  };

  it("blocks submit for a taken username even when the field was never blurred", async () => {
    const onSubmit = vi.fn();
    const checkName = vi.fn(async (value: unknown) => (value === "taken" ? "Name is taken." : null));
    render(
      <FormRender
        schema={schema}
        components={htmlComponents}
        resolvers={{ checkName }}
        onSubmit={onSubmit}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Username"), "taken");
    // submit immediately — no blur, no debounce window
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText("Name is taken.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    // fixing the value clears the error and allows submit
    const input = screen.getByLabelText("Username");
    await user.clear(input);
    await user.type(input, "free");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it("async error survives unrelated sync re-validation", async () => {
    const twoFields: FormSchema = {
      ...schema,
      fields: [
        ...schema.fields!,
        { name: "other", type: "text", label: "Other", validation: { required: { message: "req" } } },
      ],
    };
    render(
      <FormRender
        schema={twoFields}
        components={htmlComponents}
        resolvers={{ checkName: async (v) => (v === "taken" ? "Name is taken." : null) }}
        onSubmit={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    const username = screen.getByLabelText("Username");
    await user.type(username, "taken");
    await user.tab(); // blur → async runs
    expect(await screen.findByText("Name is taken.")).toBeInTheDocument();

    // typing in ANOTHER field triggers sync re-validation — async error must survive
    await user.type(screen.getByLabelText(/Other/), "hello");
    await user.tab();
    expect(screen.getByText("Name is taken.")).toBeInTheDocument();
  });

  it("does not re-run the resolver when the cached value is unchanged", async () => {
    const onSubmit = vi.fn();
    const checkName = vi.fn(async () => null);
    render(
      <FormRender
        schema={schema}
        components={htmlComponents}
        resolvers={{ checkName }}
        onSubmit={onSubmit}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Username"), "abc");
    await user.tab();
    await waitFor(() => expect(checkName).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(checkName).toHaveBeenCalledTimes(1); // cached "valid" for same value
  });

  it("disables submit and marks the wrapper while validating", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { container } = render(
      <FormRender
        schema={schema}
        components={htmlComponents}
        resolvers={{
          checkName: async () => {
            await gate;
            return null;
          },
        }}
        onSubmit={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Username"), "abc");
    await user.tab(); // debounce 10ms then in-flight until release()

    await waitFor(() => {
      expect(container.querySelector('[data-validating="true"]')).toBeTruthy();
      expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
    });

    release();
    await waitFor(() => {
      expect(container.querySelector('[data-validating="true"]')).toBeNull();
      expect(screen.getByRole("button", { name: "Submit" })).not.toBeDisabled();
    });
  });
});

// ── 3.4 loader states ────────────────────────────────────────────────────

describe("option loader states", () => {
  it("disables the select while loading and populates on resolve", async () => {
    let resolve!: (opts: { value: string; label: string }[]) => void;
    const loader = () =>
      new Promise<{ value: string; label: string }[]>((r) => {
        resolve = r;
      });
    const schema: FormSchema = {
      id: "ld",
      version: 2,
      fields: [{ name: "city", type: "select", label: "City", optionsSource: { loader: "cities" } }],
    };
    render(
      <FormRender schema={schema} components={htmlComponents} loaders={{ cities: loader }} onSubmit={vi.fn()} />,
    );

    const select = screen.getByLabelText("City") as HTMLSelectElement;
    expect(select).toBeDisabled();
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    resolve([{ value: "pnq", label: "Pune" }]);
    await waitFor(() => expect(select).not.toBeDisabled());
    expect(screen.getByText("Pune")).toBeInTheDocument();
  });

  it("keeps previous options and stops loading when the loader rejects", async () => {
    const schema: FormSchema = {
      id: "lderr",
      version: 2,
      fields: [{ name: "city", type: "select", label: "City", optionsSource: { loader: "cities" } }],
    };
    render(
      <FormRender
        schema={schema}
        components={htmlComponents}
        loaders={{ cities: async () => Promise.reject(new Error("boom")) }}
        onSubmit={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect((screen.getByLabelText("City") as HTMLSelectElement)).not.toBeDisabled(),
    );
  });
});

// ── 3.5 persistence v2 ───────────────────────────────────────────────────

describe("persistence v2", () => {
  const persistSchema = (version: number): FormSchema => ({
    id: "draft",
    version,
    settings: { persist: "session" },
    fields: [{ name: "note", type: "text", label: "Note" }],
  });
  const KEY = "form-render:draft";

  it("writes a versioned payload (debounced) and restores same-version drafts", async () => {
    window.sessionStorage.clear();
    const { unmount } = render(
      <FormRender schema={persistSchema(3)} components={htmlComponents} onSubmit={vi.fn()} />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Note"), "hello");
    await waitFor(() => {
      const saved = JSON.parse(window.sessionStorage.getItem(KEY) ?? "{}");
      expect(saved.__v).toBe(3);
      expect(saved.values?.note).toBe("hello");
    });
    unmount();

    render(<FormRender schema={persistSchema(3)} components={htmlComponents} onSubmit={vi.fn()} />);
    expect((screen.getByLabelText("Note") as HTMLInputElement).value).toBe("hello");
  });

  it("discards a stale-version draft unless migrateDraft upgrades it", () => {
    window.sessionStorage.clear();
    window.sessionStorage.setItem(KEY, JSON.stringify({ __v: 2, values: { note: "old" } }));

    const { unmount } = render(
      <FormRender schema={persistSchema(3)} components={htmlComponents} onSubmit={vi.fn()} />,
    );
    expect((screen.getByLabelText("Note") as HTMLInputElement).value).toBe("");
    unmount();

    window.sessionStorage.setItem(KEY, JSON.stringify({ __v: 2, values: { note: "old" } }));
    render(
      <FormRender
        schema={persistSchema(3)}
        components={htmlComponents}
        migrateDraft={(draft, from) => (from === 2 ? { note: `${draft.note}-migrated` } : null)}
        onSubmit={vi.fn()}
      />,
    );
    expect((screen.getByLabelText("Note") as HTMLInputElement).value).toBe("old-migrated");
  });

  it("clears the draft after a successful submit", async () => {
    window.sessionStorage.clear();
    render(
      <FormRender schema={persistSchema(3)} components={htmlComponents} onSubmit={vi.fn()} />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Note"), "bye");
    await waitFor(() => expect(window.sessionStorage.getItem(KEY)).toBeTruthy());

    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(window.sessionStorage.getItem(KEY)).toBeNull());
  });
});
