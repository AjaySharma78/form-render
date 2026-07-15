import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FormRender } from "../src/components/FormRender";
import { htmlComponents } from "../src/adapters/html";
import { buildDefaults } from "../src/compile/defaults";
import { validateSchema } from "../src/compile/validate";
import { compileZod } from "../src/compile/zod";
import type { Field, FormSchema } from "../src/types";

const contacts: Field = {
  name: "contacts",
  type: "array",
  label: "Contacts",
  addText: "Add contact",
  removeText: "Remove",
  defaultItems: 1,
  item: {
    fields: [
      {
        name: "cname",
        type: "text",
        label: "Contact name",
        validation: { required: { message: "Contact name required" } },
      },
      { name: "isPrimary", type: "switch", label: "Primary" },
      {
        name: "notes",
        type: "text",
        label: "Notes",
        visibleWhen: { field: "isPrimary", is: true }, // row-relative
      },
    ],
  },
  validation: {
    minItems: { value: 1, message: "At least one contact" },
    maxItems: { value: 3, message: "At most three contacts" },
  },
};

const schema: FormSchema = {
  id: "arr",
  version: 2,
  fields: [{ name: "team", type: "text", label: "Team" }, contacts],
};

// ── compile layer ────────────────────────────────────────────────────────

describe("array fields — defaults", () => {
  it("creates defaultItems fully-populated rows", () => {
    const d = buildDefaults(schema);
    expect(d.contacts).toEqual([{ cname: "", isPrimary: false, notes: "" }]);
  });

  it("explicit default wins over defaultItems", () => {
    const withDefault: FormSchema = {
      ...schema,
      fields: [{ ...contacts, default: [{ cname: "Ada", isPrimary: true, notes: "" }] }],
    };
    expect(buildDefaults(withDefault).contacts).toEqual([
      { cname: "Ada", isPrimary: true, notes: "" },
    ]);
  });

  it("builds nested-array defaults recursively", () => {
    const nested: FormSchema = {
      id: "n",
      version: 2,
      fields: [
        {
          name: "teams",
          type: "array",
          defaultItems: 1,
          item: {
            fields: [
              { name: "tname", type: "text" },
              { name: "members", type: "array", defaultItems: 2, item: { fields: [{ name: "m", type: "text" }] } },
            ],
          },
        },
      ],
    };
    expect(buildDefaults(nested).teams).toEqual([{ tname: "", members: [{ m: "" }, { m: "" }] }]);
  });
});

describe("array fields — zod compile", () => {
  const z = compileZod(schema);

  it("accepts valid nested rows and enforces row-level required", () => {
    expect(
      z.safeParse({ team: "x", contacts: [{ cname: "Ada", isPrimary: false, notes: "" }] }).success,
    ).toBe(true);

    const r = z.safeParse({ team: "x", contacts: [{ cname: "", isPrimary: false, notes: "" }] });
    expect(r.success).toBe(false);
    const issue = r.success ? undefined : r.error.issues[0];
    expect(issue?.message).toBe("Contact name required");
    expect(issue?.path).toEqual(["contacts", 0, "cname"]);
  });

  it("skips required checks for row fields hidden by row-relative conditions", () => {
    const withRowRequired: FormSchema = {
      id: "rr",
      version: 2,
      fields: [
        {
          ...contacts,
          item: {
            fields: [
              { name: "isPrimary", type: "switch" },
              {
                name: "notes",
                type: "text",
                visibleWhen: { field: "isPrimary", is: true },
                validation: { required: { message: "Notes required for primary" } },
              },
            ],
          },
        },
      ],
    };
    const zz = compileZod(withRowRequired);
    // hidden (isPrimary false) → empty notes fine; visible in row 1 → blocked
    const r = zz.safeParse({
      contacts: [
        { isPrimary: false, notes: "" },
        { isPrimary: true, notes: "" },
      ],
    });
    expect(r.success).toBe(false);
    const issue = r.success ? undefined : r.error.issues[0];
    expect(issue?.path).toEqual(["contacts", 1, "notes"]);
  });

  it("supports $. root references from inside rows", () => {
    const rooted: FormSchema = {
      id: "root",
      version: 2,
      fields: [
        { name: "strict", type: "switch" },
        {
          name: "rows",
          type: "array",
          item: {
            fields: [
              {
                name: "val",
                type: "text",
                requiredWhen: { field: "$.strict", is: true },
              },
            ],
          },
        },
      ],
    };
    const zz = compileZod(rooted);
    expect(zz.safeParse({ strict: false, rows: [{ val: "" }] }).success).toBe(true);
    expect(zz.safeParse({ strict: true, rows: [{ val: "" }] }).success).toBe(false);
  });

  it("enforces minItems/maxItems", () => {
    expect(z.safeParse({ team: "x", contacts: [] }).success).toBe(false);
    const four = Array.from({ length: 4 }, () => ({ cname: "a", isPrimary: false, notes: "" }));
    expect(z.safeParse({ team: "x", contacts: four }).success).toBe(false);
  });
});

describe("array fields — validateSchema", () => {
  it("rejects an array field without item.fields", () => {
    const bad: FormSchema = { id: "b", version: 2, fields: [{ name: "a", type: "array" }] };
    expect(() => validateSchema(bad)).toThrow(/no item.fields/);
  });

  it("rejects unknown sibling refs and accepts $. root refs", () => {
    const bad: FormSchema = {
      id: "b",
      version: 2,
      fields: [
        { name: "top", type: "text" },
        {
          name: "rows",
          type: "array",
          item: { fields: [{ name: "x", type: "text", visibleWhen: { field: "ghost", is: 1 } }] },
        },
      ],
    };
    expect(() => validateSchema(bad)).toThrow(/unknown field "ghost"/);

    const good: FormSchema = {
      id: "g",
      version: 2,
      fields: [
        { name: "top", type: "text" },
        {
          name: "rows",
          type: "array",
          item: { fields: [{ name: "x", type: "text", visibleWhen: { field: "$.top", notEmpty: true } }] },
        },
      ],
    };
    expect(() => validateSchema(good)).not.toThrow();
  });

  it("rejects action controls inside rows and >3 levels of nesting", () => {
    const withButton: FormSchema = {
      id: "b",
      version: 2,
      fields: [
        { name: "rows", type: "array", item: { fields: [{ name: "go", type: "submit" }] } },
      ],
    };
    expect(() => validateSchema(withButton)).toThrow(/action control/);

    const deep: FormSchema = {
      id: "d",
      version: 2,
      fields: [
        {
          name: "l1",
          type: "array",
          item: {
            fields: [
              {
                name: "l2",
                type: "array",
                item: {
                  fields: [
                    {
                      name: "l3",
                      type: "array",
                      item: {
                        fields: [
                          { name: "l4", type: "array", item: { fields: [{ name: "x", type: "text" }] } },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    };
    expect(() => validateSchema(deep)).toThrow(/deeper than 3/);
  });
});

// ── runtime ──────────────────────────────────────────────────────────────

function renderForm(s: FormSchema, props: Record<string, unknown> = {}) {
  const onSubmit = vi.fn();
  render(<FormRender schema={s} components={htmlComponents} onSubmit={onSubmit} {...props} />);
  return { onSubmit, user: userEvent.setup() };
}

describe("array fields — rendering", () => {
  it("renders defaultItems rows and adds/removes rows within bounds", async () => {
    const { user } = renderForm(schema);
    expect(screen.getAllByLabelText(/Contact name/)).toHaveLength(1);

    const add = screen.getByRole("button", { name: "Add contact" });
    await user.click(add);
    await user.click(add);
    expect(screen.getAllByLabelText(/Contact name/)).toHaveLength(3);
    expect(add).toBeDisabled(); // maxItems 3

    await user.click(screen.getByRole("button", { name: "Remove item 3" }));
    expect(screen.getAllByLabelText(/Contact name/)).toHaveLength(2);

    // minItems 1 → removing down to one row disables Remove
    await user.click(screen.getByRole("button", { name: "Remove item 2" }));
    expect(screen.getByRole("button", { name: "Remove item 1" })).toBeDisabled();
  });

  it("keeps per-row conditional visibility independent", async () => {
    const { user } = renderForm(schema);
    await user.click(screen.getByRole("button", { name: "Add contact" }));
    expect(screen.queryAllByLabelText("Notes")).toHaveLength(0);

    // toggle Primary on row 2 only
    await user.click(screen.getAllByLabelText("Primary")[1]!);
    expect(await screen.findAllByLabelText("Notes")).toHaveLength(1);
  });

  it("submits nested row values and blocks on row-level required", async () => {
    const { onSubmit, user } = renderForm(schema);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText("Contact name required")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Contact name/), "Ada");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].contacts).toEqual([
      { cname: "Ada", isPrimary: false, notes: "" },
    ]);
  });

  it("reorders rows with move up/down when sortable", async () => {
    const sortable: FormSchema = {
      id: "sort",
      version: 2,
      fields: [{ ...contacts, sortable: true, validation: undefined }],
    };
    const { user } = renderForm(sortable);
    await user.click(screen.getByRole("button", { name: "Add contact" }));
    const inputs = () => screen.getAllByLabelText(/Contact name/) as HTMLInputElement[];
    await user.type(inputs()[0]!, "first");
    await user.type(inputs()[1]!, "second");

    await user.click(screen.getByRole("button", { name: "Move item 2 up" }));
    await waitFor(() => expect(inputs()[0]!.value).toBe("second"));
    expect(inputs()[1]!.value).toBe("first");
  });

  it("prefills row counts from edit-mode defaultValues", () => {
    renderForm(schema, {
      defaultValues: {
        contacts: [
          { cname: "Ada", isPrimary: false, notes: "" },
          { cname: "Grace", isPrimary: true, notes: "wrote a compiler" },
        ],
      },
    });
    const inputs = screen.getAllByLabelText(/Contact name/) as HTMLInputElement[];
    expect(inputs).toHaveLength(2);
    expect(inputs[0]!.value).toBe("Ada");
    expect(inputs[1]!.value).toBe("Grace");
    // row 2's conditional Notes visible because its isPrimary is true
    expect(screen.getAllByLabelText("Notes")).toHaveLength(1);
  });

  it("gated wizard: Next is blocked by an invalid array row", async () => {
    const wizard: FormSchema = {
      id: "wiz",
      version: 2,
      settings: { stepValidation: "gated" },
      steps: [
        { id: "one", title: "One", fields: [contacts] },
        { id: "two", title: "Two", fields: [{ name: "done", type: "text", label: "Done" }] },
      ],
    };
    const { user } = renderForm(wizard);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Contact name required")).toBeInTheDocument();
    expect(screen.queryByLabelText("Done")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/Contact name/), "Ada");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByLabelText("Done")).toBeInTheDocument();
  });
});
