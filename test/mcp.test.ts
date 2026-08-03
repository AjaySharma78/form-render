// @vitest-environment node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFormEngineMcpServer } from "../src/mcp/index";

type TextResult = { content: { type: string; text: string }[]; isError?: boolean };
const textOf = (r: unknown) => (r as TextResult).content[0].text;

async function connect() {
  const server = await createFormEngineMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);
  return { client, server };
}

const VALID_SCHEMA = {
  id: "contact",
  version: 2,
  fields: [
    { name: "email", type: "email", label: "Email", validation: { required: { message: "req" } } },
  ],
};

describe("MCP server", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // stdio discipline: nothing in the tool path may touch stdout
    stdoutSpy = vi.spyOn(process.stdout, "write");
    logSpy = vi.spyOn(console, "log");
  });
  afterEach(() => {
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("initializes and lists all four tools", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "generate_form_schema",
      "get_schema_reference",
      "list_field_types",
      "validate_form_schema",
    ]);
  });

  it("validate_form_schema: accepts an object AND a JSON string", async () => {
    const { client } = await connect();
    for (const schema of [VALID_SCHEMA, JSON.stringify(VALID_SCHEMA)]) {
      const res = await client.callTool({ name: "validate_form_schema", arguments: { schema } });
      expect(JSON.parse(textOf(res))).toEqual({ valid: true, problems: [] });
    }
  });

  it("validate_form_schema: malformed input returns {valid:false}, never crashes", async () => {
    const { client } = await connect();

    const garbage = await client.callTool({
      name: "validate_form_schema",
      arguments: { schema: "{ not json" },
    });
    const g = JSON.parse(textOf(garbage));
    expect(g.valid).toBe(false);
    expect(g.problems[0]).toMatch(/not valid JSON/);

    const invalid = await client.callTool({
      name: "validate_form_schema",
      arguments: { schema: { id: "x", version: 2, fields: [{ name: "a.b", type: "text" }] } },
    });
    const i = JSON.parse(textOf(invalid));
    expect(i.valid).toBe(false);
    expect(i.problems.length).toBeGreaterThan(0);

    const notObject = await client.callTool({
      name: "validate_form_schema",
      arguments: { schema: 42 },
    });
    expect(JSON.parse(textOf(notObject)).valid).toBe(false);
  });

  it("get_schema_reference returns the official JSON Schema + system prompt", async () => {
    const { client } = await connect();
    const res = await client.callTool({ name: "get_schema_reference", arguments: {} });
    const body = JSON.parse(textOf(res));
    expect(body.jsonSchema.definitions ?? body.jsonSchema.$defs).toBeTruthy();
    expect(body.systemPrompt).toContain("schema");
  });

  it("list_field_types derives types + properties from schema.json", async () => {
    const { client } = await connect();
    const res = await client.callTool({ name: "list_field_types", arguments: {} });
    const body = JSON.parse(textOf(res));
    expect(body.fieldTypes).toContain("text");
    expect(body.fieldTypes).toContain("array");
    expect(body.fieldProperties.some((p: { name: string }) => p.name === "visibleWhen")).toBe(true);
  });

  it("generate_form_schema without any API key is a tool error naming the env vars — offline tools keep working", async () => {
    const saved: Record<string, string | undefined> = {};
    for (const k of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY"]) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    try {
      const { client } = await connect();
      const res = (await client.callTool({
        name: "generate_form_schema",
        arguments: { prompt: "a contact form" },
      })) as TextResult;
      expect(res.isError).toBe(true);
      expect(textOf(res)).toContain("ANTHROPIC_API_KEY");

      // the server must stay useful offline
      const validate = await client.callTool({
        name: "validate_form_schema",
        arguments: { schema: VALID_SCHEMA },
      });
      expect(JSON.parse(textOf(validate)).valid).toBe(true);
    } finally {
      for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
    }
  });

  it("generate_form_schema rejects a missing prompt and an unknown provider cleanly", async () => {
    const { client } = await connect();
    const noPrompt = (await client.callTool({
      name: "generate_form_schema",
      arguments: {},
    })) as TextResult;
    expect(noPrompt.isError).toBe(true);

    const badProvider = (await client.callTool({
      name: "generate_form_schema",
      arguments: { prompt: "x", provider: "cohere" },
    })) as TextResult;
    expect(badProvider.isError).toBe(true);
    expect(textOf(badProvider)).toContain("anthropic, openai, or google");
  });

  it("unknown tool names return a tool error, not a crash", async () => {
    const { client } = await connect();
    const res = (await client.callTool({ name: "nope", arguments: {} }).catch((e) => e)) as unknown;
    // depending on SDK version this surfaces as isError result or protocol error — either is acceptable
    const asResult = res as TextResult;
    if (asResult?.content) expect(asResult.isError).toBe(true);
    else expect(res).toBeInstanceOf(Error);
  });
});
