/**
 * MCP server — exposes the engine to agents (Claude Code, Cursor, anything
 * Model Context Protocol) over stdio:
 *
 *   claude mcp add form-render -- npx -y schema-form-engine mcp
 *
 * Tools: validate_form_schema (offline), get_schema_reference (offline),
 * list_field_types (offline), generate_form_schema (needs a provider key in
 * the environment — same detection as `form-render generate`).
 *
 * The MCP SDK is an OPTIONAL peer dependency, lazy-imported here so the main
 * package stays lean; `form-render mcp` prints an install hint when missing.
 *
 * stdio discipline: stdout belongs to the JSON-RPC transport. Never write to
 * it — all human-facing output in this module goes to stderr.
 */
import { readFileSync, statSync } from "node:fs";
import { extname, resolve as resolvePath } from "node:path";
import { validateSchema } from "../compile/validate";
import { AI_SYSTEM_PROMPT, generateFormSchema, type GenerateOptions } from "../ai";
import type { FormSchema } from "../types";

const logErr = (m: string) => process.stderr.write(m + "\n");

// ───────────────────────── provider/env detection ──────────────────────

const PROVIDER_KEYS: Record<string, readonly string[]> = {
  anthropic: ["ANTHROPIC_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  google: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
};

function detectProvider(explicit?: string): { provider: string; apiKey?: string; wanted: string } {
  if (explicit) {
    const envs = PROVIDER_KEYS[explicit] ?? [];
    return { provider: explicit, apiKey: envs.map((e) => process.env[e]).find(Boolean), wanted: envs.join(" or ") };
  }
  for (const [provider, envs] of Object.entries(PROVIDER_KEYS)) {
    const apiKey = envs.map((e) => process.env[e]).find(Boolean);
    if (apiKey) return { provider, apiKey, wanted: envs.join(" or ") };
  }
  return {
    provider: "anthropic",
    wanted: Object.values(PROVIDER_KEYS).flat().join(", "),
  };
}

const IMAGE_TYPES: Record<string, "image/png" | "image/jpeg" | "image/webp" | "image/gif"> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

// ─────────────────────────── schema.json access ────────────────────────

/** the published JSON Schema sits at the package root (two levels up from dist/mcp or src/mcp) */
function readOfficialJsonSchema(): Record<string, unknown> {
  // tsup `shims` maps import.meta.url for the CJS build
  const here = new URL("../../schema.json", import.meta.url);
  return JSON.parse(readFileSync(here, "utf8"));
}

// ─────────────────────────── tool implementations ──────────────────────

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const text = (t: string): ToolResult => ({ content: [{ type: "text", text: t }] });
const errText = (t: string): ToolResult => ({ content: [{ type: "text", text: t }], isError: true });
const json = (v: unknown): ToolResult => text(JSON.stringify(v, null, 2));

function toolValidate(args: Record<string, unknown>): ToolResult {
  let schema = args.schema;
  if (typeof schema === "string") {
    try {
      schema = JSON.parse(schema);
    } catch (e) {
      return json({ valid: false, problems: [`not valid JSON: ${e instanceof Error ? e.message : String(e)}`] });
    }
  }
  if (typeof schema !== "object" || schema === null) {
    return json({ valid: false, problems: ["schema must be a JSON object (or a JSON string encoding one)"] });
  }
  const candidate = { ...(schema as Record<string, unknown>) };
  delete candidate.$schema;
  try {
    validateSchema(candidate as unknown as FormSchema);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ valid: false, problems: message.split("\n").filter(Boolean) });
  }
  return json({ valid: true, problems: [] });
}

function toolSchemaReference(): ToolResult {
  return json({
    jsonSchema: readOfficialJsonSchema(),
    systemPrompt: AI_SYSTEM_PROMPT,
    note:
      "jsonSchema is the official FormSchema contract (also at https://schema-form-engine.vercel.app/schema.json). " +
      "systemPrompt is the same instruction block generateFormSchema uses — reuse it when generating schemas yourself.",
  });
}

function toolListFieldTypes(): ToolResult {
  const official = readOfficialJsonSchema() as {
    definitions?: Record<
      string,
      { enum?: string[]; const?: string; properties?: Record<string, { description?: string }> }
    >;
  };
  const defs = official.definitions ?? {};
  // FieldType = ValueFieldType | ActionFieldType | ContainerFieldType | string (custom);
  // single-value defs use `const`, multi-value use `enum`
  const types = ["ValueFieldType", "ActionFieldType", "ContainerFieldType"].flatMap((d) => {
    const def = defs[d];
    return def?.enum ?? (def?.const ? [def.const] : []);
  });
  const props = Object.entries(defs.Field?.properties ?? {}).map(([name, p]) => ({
    name,
    description: p.description ?? "",
  }));
  return json({
    fieldTypes: types,
    customTypesNote: "Any other string is also valid — custom types map to components you register in the adapter.",
    fieldProperties: props,
  });
}

async function toolGenerate(args: Record<string, unknown>): Promise<ToolResult> {
  const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
  if (!prompt) return errText("`prompt` is required — describe the form to generate.");

  const { provider, apiKey, wanted } = detectProvider(
    typeof args.provider === "string" ? args.provider : undefined,
  );
  if (!PROVIDER_KEYS[provider]) {
    return errText(`Unknown provider "${provider}" — use anthropic, openai, or google.`);
  }
  if (!apiKey) {
    return errText(
      `No API key found for ${provider}. Set ${wanted} in the environment the MCP server runs in ` +
        `(validate_form_schema and the reference tools work without a key).`,
    );
  }

  let image: GenerateOptions["image"];
  if (typeof args.image_path === "string" && args.image_path) {
    const path = resolvePath(process.cwd(), args.image_path);
    const mediaType = IMAGE_TYPES[extname(path).toLowerCase()];
    if (!mediaType) return errText(`Unsupported image type: ${args.image_path} (png/jpg/webp/gif).`);
    let size: number;
    try {
      size = statSync(path).size;
    } catch {
      return errText(`Cannot read image at ${path} — check the path.`);
    }
    if (size > MAX_IMAGE_BYTES) return errText(`Image is ${(size / 1048576).toFixed(1)} MB — keep it under 4 MB.`);
    image = { base64: readFileSync(path).toString("base64"), mediaType };
  }

  try {
    const { schema, repaired } = await generateFormSchema({
      prompt,
      provider: provider as GenerateOptions["provider"],
      apiKey,
      model: typeof args.model === "string" ? args.model : undefined,
      image,
      signal: AbortSignal.timeout(120_000),
    });
    return json({ schema, repaired });
  } catch (e) {
    return errText(`Generation failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ───────────────────────────── server wiring ───────────────────────────

const TOOLS = [
  {
    name: "validate_form_schema",
    description:
      "Validate a schema-form-engine FormSchema (structure, references, cycles). Works fully offline. " +
      "Returns { valid, problems[] } — never throws on bad input.",
    inputSchema: {
      type: "object",
      properties: {
        schema: {
          description: "The FormSchema to check — a JSON object, or a string containing JSON.",
        },
      },
      required: ["schema"],
    },
  },
  {
    name: "get_schema_reference",
    description:
      "Returns the official FormSchema JSON Schema plus the system prompt used for AI generation — " +
      "everything an agent needs to author valid schemas itself.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_field_types",
    description: "Lists every supported field type and Field property (derived from the official JSON Schema).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "generate_form_schema",
    description:
      "Generate a validated FormSchema from a description and optional screenshot using Anthropic/OpenAI/Google. " +
      "Requires a provider API key in the server's environment (ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY/GEMINI_API_KEY).",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "What the form should contain." },
        image_path: { type: "string", description: "Optional path to a screenshot to replicate (png/jpg/webp/gif, ≤4 MB)." },
        provider: { type: "string", enum: ["anthropic", "openai", "google"], description: "Override auto-detection." },
        model: { type: "string", description: "Override the provider's default model." },
      },
      required: ["prompt"],
    },
  },
] as const;

async function loadSdk() {
  try {
    const [{ Server }, { ListToolsRequestSchema, CallToolRequestSchema }] = await Promise.all([
      import("@modelcontextprotocol/sdk/server/index.js"),
      import("@modelcontextprotocol/sdk/types.js"),
    ]);
    return { Server, ListToolsRequestSchema, CallToolRequestSchema };
  } catch {
    logErr("✖ The MCP server needs the (optional) SDK peer dependency:");
    logErr("   npm i @modelcontextprotocol/sdk");
    throw new Error("@modelcontextprotocol/sdk is not installed");
  }
}

/** Build the wired MCP Server instance (transport-agnostic — tests use InMemoryTransport). */
export async function createFormEngineMcpServer() {
  const { Server, ListToolsRequestSchema, CallToolRequestSchema } = await loadSdk();
  const server = new Server(
    { name: "schema-form-engine", version: "2.x" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...TOOLS] }));

  server.setRequestHandler(CallToolRequestSchema, async (req: { params: { name: string; arguments?: Record<string, unknown> } }) => {
    const args = req.params.arguments ?? {};
    switch (req.params.name) {
      case "validate_form_schema":
        return toolValidate(args);
      case "get_schema_reference":
        return toolSchemaReference();
      case "list_field_types":
        return toolListFieldTypes();
      case "generate_form_schema":
        return toolGenerate(args);
      default:
        return errText(`Unknown tool: ${req.params.name}`);
    }
  });

  return server;
}

/** `form-render mcp` entry point: serve over stdio until the client disconnects. */
export async function runMcpStdio(): Promise<void> {
  const server = await createFormEngineMcpServer();
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  await server.connect(new StdioServerTransport());
  logErr("schema-form-engine MCP server running on stdio.");
}
