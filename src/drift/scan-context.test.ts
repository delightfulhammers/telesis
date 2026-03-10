import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createScanContext } from "./scan-context.js";
import { useTempDir } from "../test-utils.js";

const makeTempDir = useTempDir("scan-context-test");

const setupSrc = (rootDir: string): void => {
  const src = join(rootDir, "src");
  mkdirSync(join(src, "cli"), { recursive: true });
  mkdirSync(join(src, "config"), { recursive: true });
  writeFileSync(join(src, "index.ts"), "export {};\n");
  writeFileSync(join(src, "cli", "main.ts"), "export {};\n");
  writeFileSync(join(src, "config", "config.ts"), "export {};\n");
  writeFileSync(join(src, "config", "config.test.ts"), "export {};\n");
};

describe("createScanContext", () => {
  it("returns all src TypeScript files", () => {
    const dir = makeTempDir();
    setupSrc(dir);

    const ctx = createScanContext(dir);
    const files = ctx.srcFiles();

    expect(files).toContain("index.ts");
    expect(files).toContain("cli/main.ts");
    expect(files).toContain("config/config.ts");
  });

  it("filters excluded directories", () => {
    const dir = makeTempDir();
    setupSrc(dir);

    const ctx = createScanContext(dir);
    const files = ctx.srcFiles(["cli"]);

    expect(files).not.toContain("cli/main.ts");
    expect(files).toContain("config/config.ts");
    expect(files).toContain("index.ts");
  });

  it("caches the filesystem walk across calls", () => {
    const dir = makeTempDir();
    setupSrc(dir);

    const ctx = createScanContext(dir);
    const first = ctx.srcFiles();
    const second = ctx.srcFiles();

    // Same reference means cached (not re-walked)
    expect(first).toBe(second);
  });

  it("returns different filtered results from same cache", () => {
    const dir = makeTempDir();
    setupSrc(dir);

    const ctx = createScanContext(dir);
    const all = ctx.srcFiles();
    const noCli = ctx.srcFiles(["cli"]);

    expect(all.length).toBeGreaterThan(noCli.length);
  });
});
