import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../test-utils.js";
import { extractActiveMilestone } from "./parse.js";

describe("extractActiveMilestone", () => {
  const makeTempDir = useTempDir("milestones-parse");

  it("returns the In Progress milestone when present", () => {
    const dir = makeTempDir();
    const path = join(dir, "MILESTONES.md");
    writeFileSync(
      path,
      [
        "## v0.1.0 — First",
        "**Status:** Complete",
        "Some content.",
        "---",
        "## v0.2.0 — Second",
        "**Status:** In Progress",
        "Active work here.",
        "---",
      ].join("\n"),
    );

    const result = extractActiveMilestone(path);
    expect(result).toContain("v0.2.0 — Second");
    expect(result).toContain("Active work here.");
  });

  it("prefers In Progress over Complete", () => {
    const dir = makeTempDir();
    const path = join(dir, "MILESTONES.md");
    writeFileSync(
      path,
      [
        "## v0.1.0 — Done",
        "**Status:** Complete",
        "---",
        "## v0.2.0 — Active",
        "**Status:** In Progress",
        "---",
        "## v0.3.0 — Also Done",
        "**Status:** Complete",
        "---",
      ].join("\n"),
    );

    const result = extractActiveMilestone(path);
    expect(result).toContain("v0.2.0 — Active");
  });

  it("falls back to the last Complete milestone when none is In Progress", () => {
    const dir = makeTempDir();
    const path = join(dir, "MILESTONES.md");
    writeFileSync(
      path,
      [
        "## v0.1.0 — First",
        "**Status:** Complete",
        "First content.",
        "---",
        "## v0.2.0 — Second",
        "**Status:** Complete",
        "Second content.",
        "---",
      ].join("\n"),
    );

    const result = extractActiveMilestone(path);
    expect(result).toContain("v0.2.0 — Second");
    expect(result).toContain("Second content.");
  });

  it("returns empty string when file does not exist", () => {
    expect(extractActiveMilestone("/nonexistent/MILESTONES.md")).toBe("");
  });

  it("returns empty string when file has no milestone sections", () => {
    const dir = makeTempDir();
    const path = join(dir, "MILESTONES.md");
    writeFileSync(path, "# Milestones\n\nNothing here yet.\n");

    expect(extractActiveMilestone(path)).toBe("");
  });

  it("returns empty string for an empty file", () => {
    const dir = makeTempDir();
    const path = join(dir, "MILESTONES.md");
    writeFileSync(path, "");

    expect(extractActiveMilestone(path)).toBe("");
  });

  it("preserves full section content including sub-headings", () => {
    const dir = makeTempDir();
    const path = join(dir, "MILESTONES.md");
    writeFileSync(
      path,
      [
        "## v0.1.0 — Rich",
        "**Status:** In Progress",
        "",
        "### What Changes",
        "Some details.",
        "",
        "### Acceptance Criteria",
        "1. First criterion",
        "2. Second criterion",
        "---",
      ].join("\n"),
    );

    const result = extractActiveMilestone(path);
    expect(result).toContain("### What Changes");
    expect(result).toContain("### Acceptance Criteria");
    expect(result).toContain("2. Second criterion");
  });

  it("handles status with varied casing", () => {
    const dir = makeTempDir();
    const path = join(dir, "MILESTONES.md");
    writeFileSync(
      path,
      ["## v0.1.0 — Cased", "**Status:** in progress", "Content.", "---"].join(
        "\n",
      ),
    );

    const result = extractActiveMilestone(path);
    expect(result).toContain("v0.1.0 — Cased");
  });
});
