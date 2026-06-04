import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { submitConnection, uploadFiles } from "../examples/submit";
import type { FormValues } from "../src/types";

/** Minimal Response stub for the bits the example reads. */
function res(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

type Call = { url: string; init?: RequestInit };
let calls: Call[];

beforeEach(() => {
  calls = [];
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** Route fetch by URL; `onConnections` lets a test override the POST result. */
function mockFetch(onConnections: () => Response = () => res(200, { id: "c1" })) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, init });
      if (u.includes("/uploads/presign"))
        return res(200, { uploadUrl: "https://s3.test/put?sig=abc", fileUrl: `https://cdn.test/${(JSON.parse(String(init?.body)) as { name: string }).name}` });
      if (u.startsWith("https://s3.test/put")) return res(200, {});
      if (u.endsWith("/api/connections")) return onConnections();
      return res(200, {});
    }),
  );
}

describe("examples/submit", () => {
  it("uploads File fields and swaps them for URLs before POSTing", async () => {
    mockFetch();
    const ca = new File(["cert"], "ca.pdf", { type: "application/pdf" });
    const a1 = new File(["a"], "a.png", { type: "image/png" });
    const a2 = new File(["b"], "b.png", { type: "image/png" });

    const values: FormValues = {
      connectionName: "Prod DB",
      caCertificate: ca, // single File
      attachments: [a1, a2], // File[]
    };

    const result = await submitConnection(values);
    expect(result).toBeUndefined(); // success → nothing returned

    // each File was PUT to its presigned URL
    const puts = calls.filter((c) => c.url.startsWith("https://s3.test/put"));
    expect(puts).toHaveLength(3);
    expect(puts.every((c) => c.init?.method === "PUT")).toBe(true);

    // the POST body carries URLs, not File objects
    const post = calls.find((c) => c.url.endsWith("/api/connections"));
    const body = JSON.parse(String(post?.init?.body)) as Record<string, unknown>;
    expect(body.caCertificate).toBe("https://cdn.test/ca.pdf");
    expect(body.attachments).toEqual(["https://cdn.test/a.png", "https://cdn.test/b.png"]);
    expect(body.connectionName).toBe("Prod DB");
  });

  it("maps a 422 response to field-level errors (SubmitResult)", async () => {
    mockFetch(() => res(422, { errors: { connectionName: "Already exists." } }));

    const result = await submitConnection({ connectionName: "dupe" });
    expect(result).toEqual({ errors: { connectionName: "Already exists." } });
  });

  it("surfaces a general error when the server is unreachable", async () => {
    mockFetch(() => res(500, {}));

    const result = await submitConnection({ connectionName: "x" });
    expect(result?.errors?.host).toMatch(/server/i);
  });

  it("leaves non-file values untouched", async () => {
    mockFetch();
    const out = await uploadFiles({ host: "localhost", port: 5432 });
    expect(out).toEqual({ host: "localhost", port: 5432 });
  });
});
