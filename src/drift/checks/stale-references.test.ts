import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { useTempDir } from "../../test-utils.js";
import { staleReferencesCheck } from "./stale-references.js";

describe("stale-references", () => {
  const makeTempDir = useTempDir("stale-refs");

  const setup = (docs?: Record<string, string>): string => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "docs", "context"), { recursive: true });
    mkdirSync(join(dir, "src"), { recursive: true });
    if (docs) {
      for (const [relPath, content] of Object.entries(docs)) {
        const fullPath = join(dir, relPath);
        mkdirSync(dirname(fullPath), { recursive: true });
        writeFileSync(fullPath, content);
      }
    }
    return dir;
  };

  it("passes when all referenced paths exist", () => {
    const dir = setup({
      "docs/PRD.md": "Uses `src/index.ts` for entry.\n",
      "src/index.ts": "// entry\n",
    });
    const result = staleReferencesCheck.run(dir);
    expect(result.passed).toBe(true);
  });

  it("warns on backtick path to nonexistent file", () => {
    const dir = setup({
      "docs/PRD.md": "Uses `src/missing.ts` for entry.\n",
    });
    const result = staleReferencesCheck.run(dir);
    expect(result.passed).toBe(false);
    expect(result.details[0]).toContain("src/missing.ts");
    expect(result.details[0]).toContain("docs/PRD.md");
  });

  it("skips paths inside fenced code blocks", () => {
    const dir = setup({
      "docs/ARCHITECTURE.md": [
        "Some text",
        "```",
        "`src/nonexistent.ts`",
        "```",
        "",
      ].join("\n"),
    });
    const result = staleReferencesCheck.run(dir);
    expect(result.passed).toBe(true);
  });

  it("skips template and glob patterns", () => {
    const dir = setup({
      "docs/PRD.md": [
        "File at `src/{name}/index.ts`",
        "Pattern `src/**/*.ts`",
        "Template `src/<slug>.ts`",
      ].join("\n"),
    });
    const result = staleReferencesCheck.run(dir);
    expect(result.passed).toBe(true);
  });

  it("passes gracefully when source docs are missing", () => {
    const dir = makeTempDir();
    const result = staleReferencesCheck.run(dir);
    expect(result.passed).toBe(true);
  });

  it("includes document name in detail lines", () => {
    const dir = setup({
      "docs/VISION.md": "See `src/gone.ts`\n",
    });
    const result = staleReferencesCheck.run(dir);
    expect(result.passed).toBe(false);
    expect(result.details[0]).toContain("docs/VISION.md");
  });

  it("scans docs/context/*.md files", () => {
    const dir = setup({
      "docs/context/conventions.md": "Import from `src/nope.ts`\n",
    });
    const result = staleReferencesCheck.run(dir);
    expect(result.passed).toBe(false);
    expect(result.details[0]).toContain("docs/context/conventions.md");
  });

  it("checks relative markdown links", () => {
    const dir = setup({
      "docs/PRD.md": "See [vision](./VISION.md) for details.\n",
    });
    // VISION.md does not exist
    const result = staleReferencesCheck.run(dir);
    expect(result.passed).toBe(false);
    expect(result.details[0]).toContain("VISION.md");
  });

  it("passes for valid relative markdown links", () => {
    const dir = setup({
      "docs/PRD.md": "See [vision](./VISION.md) for details.\n",
      "docs/VISION.md": "# Vision\n",
    });
    const result = staleReferencesCheck.run(dir);
    expect(result.passed).toBe(true);
  });

  it("handles directory paths with trailing slash", () => {
    const dir = setup({
      "docs/PRD.md": "Look in `src/cli/`\n",
    });
    mkdirSync(join(dir, "src", "cli"), { recursive: true });
    const result = staleReferencesCheck.run(dir);
    expect(result.passed).toBe(true);
  });

  it("checks bare relative markdown links without dot prefix", () => {
    const dir = setup({
      "docs/PRD.md": "See [vision](VISION.md) for details.\n",
    });
    // VISION.md does not exist relative to docs/PRD.md
    const result = staleReferencesCheck.run(dir);
    expect(result.passed).toBe(false);
    expect(result.details[0]).toContain("VISION.md");
  });

  it("passes for valid bare relative markdown links", () => {
    const dir = setup({
      "docs/PRD.md": "See [vision](VISION.md) for details.\n",
      "docs/VISION.md": "# Vision\n",
    });
    const result = staleReferencesCheck.run(dir);
    expect(result.passed).toBe(true);
  });

  it("ignores paths that traverse outside the project root", () => {
    const dir = setup({
      "docs/PRD.md": "See [x](../../etc/passwd) for details.\n",
    });
    const result = staleReferencesCheck.run(dir);
    expect(result.passed).toBe(true);
  });

  it("ignores backtick paths that traverse outside the project root", () => {
    const dir = setup({
      "docs/PRD.md": "See `src/../../../etc/passwd` here.\n",
    });
    const result = staleReferencesCheck.run(dir);
    expect(result.passed).toBe(true);
  });
});
