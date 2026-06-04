import { describe, expect, it } from "vitest";
import { compileZod } from "../src/compile/zod";
import type { FormSchema } from "../src/types";

const mkFile = (name: string, sizeBytes: number, type = "application/octet-stream") => {
  const f = new File([new Uint8Array(sizeBytes)], name, { type });
  // jsdom doesn't always honor blob size; force it for the test
  Object.defineProperty(f, "size", { value: sizeBytes });
  return f;
};

const schema: FormSchema = {
  id: "files",
  version: 1,
  fields: [
    {
      name: "single",
      type: "file",
      validation: {
        maxSize: { value: 1, message: "too big" }, // 1 MB
        fileTypes: { value: [".pdf", "image/png"], message: "bad type" },
      },
    },
    {
      name: "many",
      type: "file",
      multiple: true,
      validation: { maxFiles: { value: 2, message: "too many" } },
    },
  ],
};

describe("file validation", () => {
  const z = compileZod(schema);

  it("accepts a small file of an allowed type", () => {
    const r = z.safeParse({ single: mkFile("a.pdf", 500 * 1024) });
    expect(r.success).toBe(true);
  });

  it("rejects a file over maxSize", () => {
    const r = z.safeParse({ single: mkFile("a.pdf", 2 * 1024 * 1024) });
    expect(r.success).toBe(false);
    expect(r.success ? "" : r.error.issues[0].message).toBe("too big");
  });

  it("rejects a disallowed file type", () => {
    const r = z.safeParse({ single: mkFile("a.txt", 1000, "text/plain") });
    expect(r.success).toBe(false);
    expect(r.success ? "" : r.error.issues[0].message).toBe("bad type");
  });

  it("rejects more than maxFiles", () => {
    const r = z.safeParse({
      many: [mkFile("a", 10), mkFile("b", 10), mkFile("c", 10)],
    });
    expect(r.success).toBe(false);
    expect(r.success ? "" : r.error.issues[0].message).toBe("too many");
  });

  it("allows empty (not required) file fields", () => {
    const r = z.safeParse({});
    expect(r.success).toBe(true);
  });
});
