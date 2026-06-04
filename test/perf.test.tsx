import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FormRender } from "../src/components/FormRender";
import { htmlComponents } from "../src/adapters/html";
import type { ComponentMap, FieldComponentProps, FormSchema } from "../src/types";

const renders: Record<string, number> = {};
function Counting(p: FieldComponentProps<string>) {
  renders[p.field.name] = (renders[p.field.name] ?? 0) + 1;
  return (
    <input
      aria-label={String(p.field.label)}
      value={p.value ?? ""}
      onChange={(e) => p.onChange(e.target.value)}
      onBlur={p.onBlur}
    />
  );
}
const comps: ComponentMap = { ...htmlComponents, text: Counting as never };

const schema: FormSchema = {
  id: "perf",
  version: 1,
  fields: [
    { name: "a", type: "text", label: "A" },
    { name: "b", type: "text", label: "B" },
    { name: "c", type: "text", label: "C" },
  ],
};

describe("perf: scoped re-renders", () => {
  beforeEach(() => {
    for (const k of Object.keys(renders)) delete renders[k];
  });

  it("typing in one field does not re-render unrelated fields", async () => {
    const user = userEvent.setup();
    render(<FormRender schema={schema} components={comps} onSubmit={vi.fn()} />);
    const beforeA = renders["a"];
    const beforeC = renders["c"];
    await user.type(screen.getByLabelText("B"), "hello"); // 5 keystrokes
    expect(renders["a"]).toBe(beforeA);
    expect(renders["c"]).toBe(beforeC);
  });
});
