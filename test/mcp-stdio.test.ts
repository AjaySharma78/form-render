// @vitest-environment node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const BIN = join(ROOT, "bin", "form-render.mjs");
const hasDist = existsSync(join(ROOT, "dist", "mcp", "index.js"));

/**
 * The real thing: spawn `form-render mcp`, speak JSON-RPC over stdio, and
 * assert stdout carried ONLY protocol frames (any stray log corrupts MCP).
 */
describe.skipIf(!hasDist)("form-render mcp over stdio (needs dist/ — run npm run build first)", () => {
  it("initialize → tools/list round-trips; every stdout line is a JSON-RPC frame", async () => {
    const child = spawn(process.execPath, [BIN, "mcp"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));

    const send = (msg: object) => child.stdin.write(JSON.stringify(msg) + "\n");
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "stdio-test", version: "0.0.0" },
      },
    });
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list" });

    // wait for the tools/list response (id 2) or time out
    await new Promise<void>((resolveWait, reject) => {
      const deadline = setTimeout(() => reject(new Error(`timed out.\nstdout: ${stdout}\nstderr: ${stderr}`)), 15_000);
      const check = setInterval(() => {
        if (stdout.split("\n").some((l) => l.includes('"id":2'))) {
          clearTimeout(deadline);
          clearInterval(check);
          resolveWait();
        }
      }, 50);
    }).finally(() => child.kill());

    const lines = stdout.split("\n").filter((l) => l.trim());
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) {
      const frame = JSON.parse(line); // throws (fails the test) on any non-JSON output
      expect(frame.jsonrpc).toBe("2.0");
    }
    const toolsFrame = JSON.parse(lines.find((l) => l.includes('"id":2'))!);
    expect(toolsFrame.result.tools.map((t: { name: string }) => t.name).sort()).toEqual([
      "generate_form_schema",
      "get_schema_reference",
      "list_field_types",
      "validate_form_schema",
    ]);
  }, 20_000);
});
