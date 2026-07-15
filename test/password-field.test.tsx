import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FormRender } from "../src/components/FormRender";
import { htmlComponents } from "../src/adapters/html";
import type { FormSchema } from "../src/types";

const schema: FormSchema = {
  id: "pw",
  version: 1,
  fields: [{ name: "pass", type: "password", label: "Password" }],
};

describe("html adapter — password show/hide", () => {
  it("starts masked and toggles to text and back", async () => {
    const user = userEvent.setup();
    render(<FormRender schema={schema} components={htmlComponents} onSubmit={vi.fn()} />);

    const input = screen.getByLabelText("Password") as HTMLInputElement;
    expect(input.type).toBe("password"); // masked by default

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.type).toBe("text"); // revealed

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input.type).toBe("password"); // masked again
  });

  it("keeps the typed value across toggles", async () => {
    const user = userEvent.setup();
    render(<FormRender schema={schema} components={htmlComponents} onSubmit={vi.fn()} />);

    const input = screen.getByLabelText("Password") as HTMLInputElement;
    await user.type(input, "s3cret");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.value).toBe("s3cret");
  });
});
