/**
 * AI schema generation — describe a form (or provide a screenshot), get a
 * validated FormSchema. Zero dependencies: plain fetch against the Anthropic,
 * OpenAI, or Google (Gemini) HTTP APIs, with the official system prompt and
 * one automatic repair round (validation errors are fed back to the model).
 *
 *   import { generateFormSchema } from "schema-form-engine/ai";
 *   const { schema } = await generateFormSchema({
 *     prompt: "a job application form with resume upload and 3 references",
 *     provider: "anthropic",
 *     apiKey: process.env.ANTHROPIC_API_KEY!,
 *   });
 */
import { validateSchema } from "../compile/validate";
import type { FormSchema } from "../types";
import { AI_SYSTEM_PROMPT } from "./prompt";

export { AI_SYSTEM_PROMPT };

export interface GenerateOptions {
  /** natural-language description of the form */
  prompt: string;
  provider: "anthropic" | "openai" | "google";
  apiKey: string;
  /** override the default model (anthropic: claude-sonnet-5; openai: gpt-5.1; google: gemini-2.5-flash) */
  model?: string;
  /** screenshot of a form to replicate: base64 data (no data: prefix) + media type */
  image?: { base64: string; mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif" };
  /** override the API origin (proxies, gateways) */
  baseUrl?: string;
  maxTokens?: number;
  signal?: AbortSignal;
  /** injectable for tests / custom transports */
  fetchImpl?: typeof fetch;
}

export interface GenerateResult {
  schema: FormSchema;
  /** true when the first attempt failed validation and a repair round fixed it */
  repaired: boolean;
  /** the raw model text of the accepted attempt */
  raw: string;
}

const DEFAULT_MODEL = {
  anthropic: "claude-sonnet-5",
  openai: "gpt-5.1",
  google: "gemini-2.5-flash",
} as const;

/** Strip markdown fences / surrounding prose and parse the first JSON object. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced ? fenced[1]! : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object found in model output.");
  return JSON.parse(candidate.slice(start, end + 1));
}

async function callAnthropic(opts: GenerateOptions, messages: unknown[]): Promise<string> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${opts.baseUrl ?? "https://api.anthropic.com"}/v1/messages`, {
    method: "POST",
    signal: opts.signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
      // permit BYO-key use from browsers (playgrounds); harmless server-side
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL.anthropic,
      max_tokens: opts.maxTokens ?? 8192,
      system: AI_SYSTEM_PROMPT,
      messages,
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
  return data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
}

async function callOpenAI(opts: GenerateOptions, messages: unknown[]): Promise<string> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${opts.baseUrl ?? "https://api.openai.com"}/v1/chat/completions`, {
    method: "POST",
    signal: opts.signal,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL.openai,
      max_completion_tokens: opts.maxTokens ?? 8192,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: AI_SYSTEM_PROMPT }, ...messages],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message.content ?? "";
}

async function callGoogle(opts: GenerateOptions, messages: unknown[]): Promise<string> {
  const doFetch = opts.fetchImpl ?? fetch;
  const model = opts.model ?? DEFAULT_MODEL.google;
  // normalize our provider-neutral messages into Gemini `contents`
  const contents = (messages as Array<Record<string, unknown>>).map((m) => {
    if (m.parts) return m; // already Gemini-shaped (built by userMessage)
    return {
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content) }],
    };
  });
  const res = await doFetch(
    `${opts.baseUrl ?? "https://generativelanguage.googleapis.com"}/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      signal: opts.signal,
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": opts.apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: AI_SYSTEM_PROMPT }] },
        contents,
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: opts.maxTokens ?? 8192,
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Google API error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
}

function userMessage(opts: GenerateOptions, text: string): unknown {
  if (opts.provider === "google") {
    const parts: unknown[] = [];
    if (opts.image)
      parts.push({ inline_data: { mime_type: opts.image.mediaType, data: opts.image.base64 } });
    parts.push({ text });
    return { role: "user", parts };
  }
  if (!opts.image) return { role: "user", content: text };
  if (opts.provider === "anthropic") {
    return {
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: opts.image.mediaType, data: opts.image.base64 },
        },
        { type: "text", text },
      ],
    };
  }
  return {
    role: "user",
    content: [
      {
        type: "image_url",
        image_url: { url: `data:${opts.image.mediaType};base64,${opts.image.base64}` },
      },
      { type: "text", text },
    ],
  };
}

/** Parse + validate one model response; returns the schema or throws with details. */
function accept(raw: string): FormSchema {
  const parsed = extractJson(raw) as FormSchema;
  if (!parsed || typeof parsed !== "object" || !parsed.id) {
    throw new Error("Model output is not a FormSchema (missing id).");
  }
  if (typeof parsed.version !== "number") parsed.version = 1;
  validateSchema(parsed); // throws with collected problems
  return parsed;
}

/**
 * Generate a validated FormSchema from a description (and optional screenshot).
 * Invalid first attempts get ONE repair round with the validation errors fed
 * back; a second failure throws.
 */
export async function generateFormSchema(opts: GenerateOptions): Promise<GenerateResult> {
  const call =
    opts.provider === "anthropic"
      ? callAnthropic
      : opts.provider === "google"
        ? callGoogle
        : callOpenAI;
  const first = await call(opts, [userMessage(opts, opts.prompt)]);

  let firstError: Error;
  try {
    return { schema: accept(first), repaired: false, raw: first };
  } catch (e) {
    firstError = e instanceof Error ? e : new Error(String(e));
  }

  // repair round: show the model its own output + the exact validation errors
  const repairText =
    `Your previous schema was invalid.\n\nPrevious output:\n${first}\n\n` +
    `Problems:\n${firstError.message}\n\n` +
    `Return the corrected, complete FormSchema JSON only.`;
  const second = await call(opts, [
    userMessage(opts, opts.prompt),
    { role: "assistant", content: first },
    { role: "user", content: repairText },
  ]);

  try {
    return { schema: accept(second), repaired: true, raw: second };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `AI schema generation failed after a repair round.\nFirst error: ${firstError.message}\nSecond error: ${msg}`,
    );
  }
}
