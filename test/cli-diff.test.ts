// @vitest-environment node
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const BIN = join(ROOT, "bin", "form-render.mjs");
const hasDist = existsSync(join(ROOT, "dist", "index.js"));

function runDiff(args: string[]): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [BIN, "diff", ...args], { encoding: "utf8" });
    return { status: 0, stdout, stderr: "" };
  } catch (e) {
    const err = e as { status: number | null; stdout?: string; stderr?: string };
    return { status: err.status ?? -1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

const A = {
  id: "f",
  version: 2,
  fields: [
    { name: "email", type: "email", validation: { required: { message: "req" } } },
    { name: "age", type: "number" },
  ],
};

// the CLI loads the built library — skip (with a visible reason) before `npm run build`
describe.skipIf(!hasDist)("form-render diff CLI (needs dist/ — run npm run build first)", () => {
  const dir = mkdtempSync(join(tmpdir(), "sfe-diff-"));
  const write = (name: string, obj: unknown) => {
    const p = join(dir, name);
    writeFileSync(p, JSON.stringify(obj, null, 2));
    return p;
  };

  const aPath = write("a.json", A);

  it("exit 0 + clean message when only risky/cosmetic changes and default threshold", () => {
    const b = JSON.parse(JSON.stringify(A));
    b.fields[1].default = 21; // risky only
    const r = runDiff([aPath, write("b-risky.json", b)]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("RISKY");
  });

  it("exit 1 when a breaking change trips the default threshold", () => {
    const b = JSON.parse(JSON.stringify(A));
    b.fields = [b.fields[0]]; // age removed
    const r = runDiff([aPath, write("b-breaking.json", b)]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("field-removed");
  });

  it("--fail-on risky trips on risky-only diffs", () => {
    const b = JSON.parse(JSON.stringify(A));
    b.fields[1].default = 21;
    const r = runDiff([aPath, join(dir, "b-risky.json"), "--fail-on", "risky"]);
    expect(r.status).toBe(1);
  });

  it("--json emits the machine report (reportVersion 1)", () => {
    const b = JSON.parse(JSON.stringify(A));
    b.fields = [b.fields[0]];
    const r = runDiff([aPath, join(dir, "b-breaking.json"), "--json"]);
    expect(r.status).toBe(1);
    const report = JSON.parse(r.stdout);
    expect(report.reportVersion).toBe(1);
    expect(report.findings.some((f: { code: string }) => f.code === "field-removed")).toBe(true);
  });

  it("exit 2 on unparseable input; --allow-invalid compares anyway", () => {
    const badPath = join(dir, "bad.json");
    writeFileSync(badPath, "{ nope");
    expect(runDiff([aPath, badPath]).status).toBe(2);

    // structurally invalid (dotted name) but parseable
    const invalid = write("invalid.json", { id: "f", version: 2, fields: [{ name: "a.b", type: "text" }] });
    expect(runDiff([aPath, invalid]).status).toBe(2);
    const allowed = runDiff([aPath, invalid, "--allow-invalid"]);
    expect([0, 1]).toContain(allowed.status);
  });

  it("identical files exit 0 with the all-clear line", () => {
    const r = runDiff([aPath, aPath]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("No breaking or risky differences");
  });
});
