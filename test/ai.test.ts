import { describe, expect, it, vi } from "vitest";
import { AI_SYSTEM_PROMPT, extractJson, generateFormSchema } from "../src/ai";

const VALID = {
  id: "demo",
  version: 1,
  fields: [{ name: "email", type: "email", label: "Email" }],
};
// invalid: visibleWhen references an unknown field
const INVALID = {
  id: "demo",
  version: 1,
  fields: [{ name: "a", type: "text", visibleWhen: { field: "ghost", is: 1 } }],
};

function anthropicResponse(text: string) {
  return new Response(JSON.stringify({ content: [{ type: "text", text }] }), { status: 200 });
}
function openaiResponse(text: string) {
  return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), {
    status: 200,
  });
}

describe("extractJson", () => {
  it("parses bare, fenced, and prose-wrapped JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here is your schema:\n{"a":1}\nEnjoy!')).toEqual({ a: 1 });
    expect(() => extractJson("no json here")).toThrow(/No JSON object/);
  });
});

describe("generateFormSchema", () => {
  it("anthropic: sends the system prompt and returns a validated schema", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.anthropic.com/v1/messages");
      const body = JSON.parse(String(init?.body));
      expect(body.system).toBe(AI_SYSTEM_PROMPT);
      expect(body.model).toBe("claude-sonnet-5");
      expect(body.messages[0]).toEqual({ role: "user", content: "an email form" });
      return anthropicResponse(JSON.stringify(VALID));
    });
    const result = await generateFormSchema({
      prompt: "an email form",
      provider: "anthropic",
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.repaired).toBe(false);
    expect(result.schema.id).toBe("demo");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("openai: uses chat completions with json_object response format", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.openai.com/v1/chat/completions");
      const body = JSON.parse(String(init?.body));
      expect(body.response_format).toEqual({ type: "json_object" });
      expect(body.messages[0].role).toBe("system");
      return openaiResponse(JSON.stringify(VALID));
    });
    const result = await generateFormSchema({
      prompt: "an email form",
      provider: "openai",
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.schema.fields?.[0]?.name).toBe("email");
  });

  it("google: posts Gemini contents with json response type and system instruction", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      );
      expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe("k");
      const body = JSON.parse(String(init?.body));
      expect(body.system_instruction.parts[0].text).toBe(AI_SYSTEM_PROMPT);
      expect(body.generationConfig.responseMimeType).toBe("application/json");
      expect(body.contents[0]).toEqual({ role: "user", parts: [{ text: "an email form" }] });
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(VALID) }] } }] }),
        { status: 200 },
      );
    });
    const result = await generateFormSchema({
      prompt: "an email form",
      provider: "google",
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.schema.id).toBe("demo");
  });

  it("google: repair round maps assistant history to the model role", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      call++;
      if (call === 1)
        return new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(INVALID) }] } }] }),
          { status: 200 },
        );
      const body = JSON.parse(String(init?.body));
      expect(body.contents[1].role).toBe("model");
      expect(body.contents[2].parts[0].text).toMatch(/unknown field "ghost"/);
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(VALID) }] } }] }),
        { status: 200 },
      );
    });
    const result = await generateFormSchema({
      prompt: "x",
      provider: "google",
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.repaired).toBe(true);
  });

  it("runs one repair round with the validation errors fed back", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      call++;
      if (call === 1) return anthropicResponse(JSON.stringify(INVALID));
      const body = JSON.parse(String(init?.body));
      const repairMsg = body.messages[2];
      expect(repairMsg.role).toBe("user");
      expect(repairMsg.content).toMatch(/unknown field "ghost"/);
      return anthropicResponse("```json\n" + JSON.stringify(VALID) + "\n```");
    });
    const result = await generateFormSchema({
      prompt: "x",
      provider: "anthropic",
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.repaired).toBe(true);
    expect(result.schema.id).toBe("demo");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws with both errors when the repair round also fails", async () => {
    const fetchImpl = vi.fn(async () => anthropicResponse(JSON.stringify(INVALID)));
    await expect(
      generateFormSchema({
        prompt: "x",
        provider: "anthropic",
        apiKey: "k",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/after a repair round/);
  });

  it("sends image blocks in the provider's format", async () => {
    const fetchImpl = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const content = body.messages[0].content;
      expect(content[0].type).toBe("image");
      expect(content[0].source.media_type).toBe("image/png");
      return anthropicResponse(JSON.stringify(VALID));
    });
    await generateFormSchema({
      prompt: "replicate this form",
      provider: "anthropic",
      apiKey: "k",
      image: { base64: "aGVsbG8=", mediaType: "image/png" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
  });

  it("surfaces API errors with status", async () => {
    const fetchImpl = vi.fn(async () => new Response("rate limited", { status: 429 }));
    await expect(
      generateFormSchema({
        prompt: "x",
        provider: "anthropic",
        apiKey: "k",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/429/);
  });
});
