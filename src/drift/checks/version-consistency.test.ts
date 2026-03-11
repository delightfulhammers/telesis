import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../../test-utils.js";
import {
  findLatestCompleteVersion,
  versionConsistencyCheck,
} from "./version-consistency.js";

describe("findLatestCompleteVersion", () => {
  it("finds the latest complete milestone version", () => {
    const content = [
      "## v0.1.0 — MVP",
      "**Status:** Complete",
      "---",
      "## v0.2.0 — Init",
      "**Status:** Complete",
      "---",
      "## v0.3.0 — Drift",
      "**Status:** Not Started",
    ].join("\n");
    expect(findLatestCompleteVersion(content)).toBe("0.2.0");
  });

  it("returns undefined when no milestones are complete", () => {
    const content = ["## v0.1.0 — MVP", "**Status:** Not Started"].join("\n");
    expect(findLatestCompleteVersion(content)).toBeUndefined();
  });

  it("handles version without v prefix", () => {
    const content = ["## 1.0.0 — Release", "**Status:** Complete"].join("\n");
    expect(findLatestCompleteVersion(content)).toBe("1.0.0");
  });

  it("ignores versions inside code fences", () => {
    const content = [
      "## v0.1.0 — MVP",
      "**Status:** Complete",
      "```",
      "## v99.0.0 — Fake",
      "**Status:** Complete",
      "```",
    ].join("\n");
    expect(findLatestCompleteVersion(content)).toBe("0.1.0");
  });
});

describe("version-consistency check", () => {
  const makeTempDir = useTempDir("version-consistency");

  const setup = (version: string, milestones: string): string => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ version }));
    writeFileSync(join(dir, "docs", "MILESTONES.md"), milestones);
    return dir;
  };

  it("passes when versions match", () => {
    const dir = setup("0.8.1", "## v0.8.1 — Fix\n**Status:** Complete\n");
    const result = versionConsistencyCheck.run(dir);
    expect(result.passed).toBe(true);
    expect(result.details).toEqual([]);
  });

  it("warns when versions mismatch", () => {
    const dir = setup("0.7.0", "## v0.8.0 — CI\n**Status:** Complete\n");
    const result = versionConsistencyCheck.run(dir);
    expect(result.passed).toBe(false);
    expect(result.severity).toBe("warning");
    expect(result.details).toContainEqual("package.json: 0.7.0");
    expect(result.details).toContainEqual("Latest complete milestone: 0.8.0");
  });

  it("skips when package.json is missing", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(
      join(dir, "docs", "MILESTONES.md"),
      "## v0.1.0\n**Status:** Complete\n",
    );
    const result = versionConsistencyCheck.run(dir);
    expect(result.passed).toBe(true);
    expect(result.message).toContain("skipped");
  });

  it("skips when MILESTONES.md is missing", () => {
    const dir = makeTempDir();
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ version: "0.1.0" }),
    );
    const result = versionConsistencyCheck.run(dir);
    expect(result.passed).toBe(true);
    expect(result.message).toContain("skipped");
  });

  it("skips when no milestones are complete", () => {
    const dir = setup("0.1.0", "## v0.1.0 — MVP\n**Status:** Not Started\n");
    const result = versionConsistencyCheck.run(dir);
    expect(result.passed).toBe(true);
    expect(result.message).toContain("skipped");
  });

  it("skips when package.json has no version field", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "test" }));
    writeFileSync(
      join(dir, "docs", "MILESTONES.md"),
      "## v0.1.0\n**Status:** Complete\n",
    );
    const result = versionConsistencyCheck.run(dir);
    expect(result.passed).toBe(true);
    expect(result.message).toContain("skipped");
  });

  it("uses the latest complete milestone, not the first", () => {
    const dir = setup(
      "0.8.1",
      [
        "## v0.1.0 — MVP",
        "**Status:** Complete",
        "---",
        "## v0.8.1 — Fix",
        "**Status:** Complete",
        "---",
        "## v0.9.0 — Next",
        "**Status:** Not Started",
      ].join("\n"),
    );
    const result = versionConsistencyCheck.run(dir);
    expect(result.passed).toBe(true);
  });
});
