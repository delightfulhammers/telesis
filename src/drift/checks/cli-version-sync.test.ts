import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../../test-utils.js";
import { cliVersionSyncCheck } from "./cli-version-sync.js";

describe("cliVersionSyncCheck", () => {
  const makeTempDir = useTempDir("cli-version-sync");

  const setup = (
    dir: string,
    opts: { pkgVersion?: string; cliVersion?: string; noEntry?: boolean },
  ) => {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "test", version: opts.pkgVersion ?? "0.9.0" }),
    );
    if (!opts.noEntry) {
      writeFileSync(
        join(dir, "src", "index.ts"),
        `const program = new Command("test")\n  .version("${opts.cliVersion ?? "0.9.0"}")\n  .parse();\n`,
      );
    }
  };

  it("passes when versions match", () => {
    const dir = makeTempDir();
    setup(dir, { pkgVersion: "0.9.0", cliVersion: "0.9.0" });

    const result = cliVersionSyncCheck.run(dir);
    expect(result.passed).toBe(true);
    expect(result.message).toContain("matches");
  });

  it("fails when versions differ", () => {
    const dir = makeTempDir();
    setup(dir, { pkgVersion: "0.9.0", cliVersion: "0.3.0" });

    const result = cliVersionSyncCheck.run(dir);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("0.3.0");
    expect(result.message).toContain("0.9.0");
    expect(result.details).toHaveLength(2);
  });

  it("skips when package.json missing", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "index.ts"), '.version("1.0.0")');

    const result = cliVersionSyncCheck.run(dir);
    expect(result.passed).toBe(true);
    expect(result.message).toContain("skipped");
  });

  it("skips when src/index.ts missing", () => {
    const dir = makeTempDir();
    setup(dir, { noEntry: true });

    const result = cliVersionSyncCheck.run(dir);
    expect(result.passed).toBe(true);
    expect(result.message).toContain("skipped");
  });

  it("skips when no .version() call found", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "test", version: "1.0.0" }),
    );
    writeFileSync(
      join(dir, "src", "index.ts"),
      'const program = new Command("test").parse();\n',
    );

    const result = cliVersionSyncCheck.run(dir);
    expect(result.passed).toBe(true);
    expect(result.message).toContain("skipped");
  });

  it("passes when version is read dynamically from package.json", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "test", version: "1.2.3" }),
    );
    writeFileSync(
      join(dir, "src", "index.ts"),
      'const program = new Command("test")\n  .version(readVersion())\n  .parse();\n',
    );

    const result = cliVersionSyncCheck.run(dir);
    expect(result.passed).toBe(true);
    expect(result.message).toContain("dynamically");
    expect(result.message).toContain("1.2.3");
  });

  it("skips when package.json has no version", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "test" }));
    writeFileSync(join(dir, "src", "index.ts"), '.version("1.0.0")');

    const result = cliVersionSyncCheck.run(dir);
    expect(result.passed).toBe(true);
    expect(result.message).toContain("skipped");
  });
});
