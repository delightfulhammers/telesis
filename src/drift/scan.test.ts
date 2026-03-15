import { describe, it, expect } from "vitest";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../test-utils.js";
import {
  findTypeScriptFiles,
  findSourceFiles,
  extensionsForLanguages,
  scanForPattern,
} from "./scan.js";

describe("findTypeScriptFiles", () => {
  const makeTempDir = useTempDir("scan");

  it("finds .ts files recursively", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "sub"), { recursive: true });
    writeFileSync(join(dir, "a.ts"), "");
    writeFileSync(join(dir, "sub", "b.ts"), "");
    writeFileSync(join(dir, "c.js"), "");

    const files = findTypeScriptFiles(dir);
    expect(files).toEqual(["a.ts", "sub/b.ts"]);
  });

  it("excludes .d.ts files", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "types.d.ts"), "");
    writeFileSync(join(dir, "real.ts"), "");

    const files = findTypeScriptFiles(dir);
    expect(files).toEqual(["real.ts"]);
  });

  it("excludes node_modules", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(dir, "node_modules", "pkg", "index.ts"), "");
    writeFileSync(join(dir, "src.ts"), "");

    const files = findTypeScriptFiles(dir);
    expect(files).toEqual(["src.ts"]);
  });

  it("excludes specified directories", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "vendor"), { recursive: true });
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "vendor", "lib.ts"), "");
    writeFileSync(join(dir, "src", "app.ts"), "");

    const files = findTypeScriptFiles(dir, ["vendor"]);
    expect(files).toEqual(["src/app.ts"]);
  });

  it("returns empty array for empty directory", () => {
    const dir = makeTempDir();
    expect(findTypeScriptFiles(dir)).toEqual([]);
  });

  it("returns empty array when directory does not exist", () => {
    expect(findTypeScriptFiles("/nonexistent/path")).toEqual([]);
  });

  it("skips symbolic links", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "real"), { recursive: true });
    writeFileSync(join(dir, "real", "a.ts"), "");
    symlinkSync(join(dir, "real"), join(dir, "linked"));

    const files = findTypeScriptFiles(dir);
    expect(files).toEqual(["real/a.ts"]);
  });
});

describe("findSourceFiles", () => {
  const makeTempDir = useTempDir("source-files");

  it("finds .ts files by default (backward compat)", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "a.ts"), "");
    writeFileSync(join(dir, "b.go"), "");

    const files = findSourceFiles(dir);
    expect(files).toEqual(["a.ts"]);
  });

  it("finds .go files when specified", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "a.ts"), "");
    writeFileSync(join(dir, "b.go"), "");

    const files = findSourceFiles(dir, [".go"]);
    expect(files).toEqual(["b.go"]);
  });

  it("finds multiple extension types", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "a.ts"), "");
    writeFileSync(join(dir, "b.go"), "");
    writeFileSync(join(dir, "c.py"), "");

    const files = findSourceFiles(dir, [".ts", ".go"]);
    expect(files).toEqual(["a.ts", "b.go"]);
  });

  it("skips .d.ts only when .ts is in extensions", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "types.d.ts"), "");
    writeFileSync(join(dir, "real.ts"), "");

    const files = findSourceFiles(dir, [".ts"]);
    expect(files).toEqual(["real.ts"]);
  });

  it("does not skip .d.ts when .ts is not in extensions", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "types.d.ts"), "");
    writeFileSync(join(dir, "real.go"), "");

    // Even with .d.ts extension, if .ts isn't in extensions, don't apply the filter
    const files = findSourceFiles(dir, [".go"]);
    expect(files).toEqual(["real.go"]);
  });
});

describe("extensionsForLanguages", () => {
  it("returns extensions for Go", () => {
    expect(extensionsForLanguages(["Go"])).toEqual([".go"]);
  });

  it("returns extensions for TypeScript and Python", () => {
    const result = extensionsForLanguages(["TypeScript", "Python"]);
    expect(result).toContain(".ts");
    expect(result).toContain(".tsx");
    expect(result).toContain(".py");
  });

  it("returns empty for unknown language", () => {
    expect(extensionsForLanguages(["Brainfuck"])).toEqual([]);
  });

  it("deduplicates extensions", () => {
    const result = extensionsForLanguages(["TypeScript", "TypeScript"]);
    const tsCount = result.filter((e) => e === ".ts").length;
    expect(tsCount).toBe(1);
  });
});

describe("scanForPattern", () => {
  const makeTempDir = useTempDir("scan-pattern");

  it("finds matching lines across files", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "a.ts"), 'import foo from "bar";\nconst x = 1;');
    writeFileSync(join(dir, "b.ts"), "no match here\n");

    const hits = scanForPattern(dir, ["a.ts", "b.ts"], /import.*from/);
    expect(hits).toEqual([
      { file: "a.ts", line: 1, content: 'import foo from "bar";' },
    ]);
  });

  it("reports correct line numbers", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "f.ts"), "line1\nline2\ntarget\nline4\n");

    const hits = scanForPattern(dir, ["f.ts"], /target/);
    expect(hits).toEqual([{ file: "f.ts", line: 3, content: "target" }]);
  });

  it("returns empty array when no matches", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "f.ts"), "nothing here\n");

    const hits = scanForPattern(dir, ["f.ts"], /missing/);
    expect(hits).toEqual([]);
  });

  it("handles global-flag regex without lastIndex drift", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "a.ts"), "target\ntarget\ntarget\n");

    const hits = scanForPattern(dir, ["a.ts"], /target/g);
    expect(hits).toHaveLength(3);
  });
});
