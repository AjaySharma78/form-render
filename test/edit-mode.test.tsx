import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FormRender } from "../src/components/FormRender";
import { htmlComponents } from "../src/adapters/html";
import type { FormSchema } from "../src/types";

const schema: FormSchema = {
  id: "edit",
  version: 1,
  fields: [
    { name: "host", type: "text", label: "Host" },
    { name: "port", type: "number", label: "Port" },
  ],
};

describe("edit-mode prefill", () => {
  it("defaultValues prefills fields, partial is fine (rest fall back to empties)", () => {
    render(
      <FormRender
        schema={schema}
        components={htmlComponents}
        defaultValues={{ host: "db.example.com" }}
        onSubmit={vi.fn()}
      />,
    );
    expect((screen.getByLabelText("Host") as HTMLInputElement).value).toBe("db.example.com");
    expect((screen.getByLabelText("Port") as HTMLInputElement).value).toBe(""); // empty fallback
  });

  it("values syncs prefill that arrives/changes after mount", () => {
    const { rerender } = render(
      <FormRender schema={schema} components={htmlComponents} values={undefined} onSubmit={vi.fn()} />,
    );
    expect((screen.getByLabelText("Host") as HTMLInputElement).value).toBe(""); // loading

    // record fetched → passed in on a later render
    rerender(
      <FormRender
        schema={schema}
        components={htmlComponents}
        values={{ host: "db.example.com", port: 5432 }}
        onSubmit={vi.fn()}
      />,
    );
    expect((screen.getByLabelText("Host") as HTMLInputElement).value).toBe("db.example.com");
    expect((screen.getByLabelText("Port") as HTMLInputElement).value).toBe("5432");
  });

  it("keeps the user's in-progress edits when values re-syncs (keepDirtyValues)", async () => {
    const user = userEvent.setup();
    const v = { host: "db.example.com", port: 5432 };
    const { rerender } = render(
      <FormRender schema={schema} components={htmlComponents} values={v} onSubmit={vi.fn()} />,
    );

    // user edits host
    const host = screen.getByLabelText("Host") as HTMLInputElement;
    await user.clear(host);
    await user.type(host, "edited.example.com");

    // a background refetch delivers a new object (port changed upstream)
    rerender(
      <FormRender
        schema={schema}
        components={htmlComponents}
        values={{ host: "db.example.com", port: 6543 }}
        onSubmit={vi.fn()}
      />,
    );

    expect((screen.getByLabelText("Host") as HTMLInputElement).value).toBe("edited.example.com"); // dirty kept
    expect((screen.getByLabelText("Port") as HTMLInputElement).value).toBe("6543"); // untouched updated
  });
});
