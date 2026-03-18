import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { summarizeCodebase } from "./codebase-summary.js";
import { useTempDir } from "../test-utils.js";

const makeTempDir = useTempDir("codebase-summary-test");

describe("summarizeCodebase", () => {
  it("returns empty string for empty directory", () => {
    const dir = makeTempDir();
    expect(summarizeCodebase(dir)).toBe("");
  });

  it("detects package.json", () => {
    const dir = makeTempDir();
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "test", version: "1.0.0" }),
    );
    const summary = summarizeCodebase(dir);
    expect(summary).toContain("package.json");
    expect(summary).toContain("Node/TypeScript");
  });

  it("detects go.mod", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "go.mod"), "module example.com/test\n\ngo 1.22\n");
    const summary = summarizeCodebase(dir);
    expect(summary).toContain("go.mod");
    expect(summary).toContain("Go");
  });

  it("includes README.md content", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "README.md"), "# My Project\n\nThis is a test.");
    const summary = summarizeCodebase(dir);
    expect(summary).toContain("My Project");
  });

  it("includes directory structure", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "src"), { recursive: true });
    mkdirSync(join(dir, "tests"), { recursive: true });
    writeFileSync(join(dir, "src", "main.ts"), "console.log('hi')");
    const summary = summarizeCodebase(dir);
    expect(summary).toContain("src/");
  });

  it("wraps content in UNTRUSTED tags", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "README.md"), "# Test");
    const summary = summarizeCodebase(dir);
    expect(summary).toContain("<codebase-summary>");
    expect(summary).toContain("UNTRUSTED");
    expect(summary).toContain("</codebase-summary>");
  });

  it("deduplicates manifests per language label", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "pyproject.toml"), '[project]\nname = "test"\n');
    writeFileSync(join(dir, "requirements.txt"), "flask\nrequests\n");
    const summary = summarizeCodebase(dir);
    // pyproject.toml should be included as a manifest section
    expect(summary).toContain("### pyproject.toml (Python)");
    // requirements.txt manifest section should be skipped (duplicate label)
    // (it may still appear in the directory tree listing — that's expected)
    expect(summary).not.toContain("### requirements.txt (Python)");
  });
});
