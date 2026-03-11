import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../test-utils.js";
import {
  extractActiveMilestone,
  parseActiveMilestone,
  parseMilestoneText,
} from "./parse.js";

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

describe("parseMilestoneText", () => {
  it("parses version from heading with v prefix", () => {
    const raw = [
      "## v0.9.0 — Milestone Validation",
      "**Status:** In Progress",
    ].join("\n");

    const result = parseMilestoneText(raw);
    expect(result).toBeDefined();
    expect(result!.version).toBe("0.9.0");
    expect(result!.name).toBe("v0.9.0 — Milestone Validation");
  });

  it("parses version from heading without v prefix", () => {
    const raw = ["## 1.2.3 — Something", "**Status:** Complete"].join("\n");
    const result = parseMilestoneText(raw);
    expect(result!.version).toBe("1.2.3");
  });

  it("extracts status correctly", () => {
    const raw = ["## v0.5.0 — Review Agent", "**Status:** In Progress"].join(
      "\n",
    );
    const result = parseMilestoneText(raw);
    expect(result!.status).toBe("In Progress");
  });

  it("extracts all numbered acceptance criteria", () => {
    const raw = [
      "## v0.9.0 — Test",
      "**Status:** In Progress",
      "",
      "### Acceptance Criteria",
      "",
      "1. First criterion",
      "2. Second criterion with detail",
      "3. Third criterion",
    ].join("\n");

    const result = parseMilestoneText(raw);
    expect(result!.criteria).toEqual([
      "First criterion",
      "Second criterion with detail",
      "Third criterion",
    ]);
  });

  it("extracts TDD references", () => {
    const raw = [
      "## v0.8.1 — Fix",
      "**Status:** Complete",
      "",
      "**Reference:** TDD-006 (Review Convergence), Issue #40",
    ].join("\n");

    const result = parseMilestoneText(raw);
    expect(result!.tddReferences).toEqual([6]);
  });

  it("extracts multiple TDD references", () => {
    const raw = [
      "## v0.2.0 — Init",
      "**Status:** Complete",
      "",
      "**Reference:** TDD-001 (Init Agent), TDD-003 (Review), ADR-001",
    ].join("\n");

    const result = parseMilestoneText(raw);
    expect(result!.tddReferences).toEqual([1, 3]);
  });

  it("handles missing acceptance criteria section", () => {
    const raw = [
      "## v0.1.0 — MVP",
      "**Status:** Complete",
      "",
      "Just some content without criteria.",
    ].join("\n");

    const result = parseMilestoneText(raw);
    expect(result!.criteria).toEqual([]);
  });

  it("returns undefined for empty string", () => {
    expect(parseMilestoneText("")).toBeUndefined();
  });

  it("stops collecting criteria at next sub-heading", () => {
    const raw = [
      "## v0.9.0 — Test",
      "**Status:** In Progress",
      "",
      "### Acceptance Criteria",
      "1. First",
      "2. Second",
      "",
      "### Build Sequence",
      "1. Phase 1 — not a criterion",
    ].join("\n");

    const result = parseMilestoneText(raw);
    expect(result!.criteria).toEqual(["First", "Second"]);
  });

  it("preserves raw text", () => {
    const raw = [
      "## v0.9.0 — Test",
      "**Status:** In Progress",
      "Some content.",
    ].join("\n");

    const result = parseMilestoneText(raw);
    expect(result!.raw).toBe(raw);
  });
});

describe("parseActiveMilestone", () => {
  const makeTempDir = useTempDir("milestones-parse-active");

  it("returns structured info for the active milestone", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(
      join(dir, "docs", "MILESTONES.md"),
      [
        "## v0.9.0 — Milestone Validation",
        "**Status:** In Progress",
        "",
        "**Reference:** TDD-007 (Validation)",
        "",
        "### Acceptance Criteria",
        "1. Check works",
        "2. Complete works",
        "---",
      ].join("\n"),
    );

    const result = parseActiveMilestone(dir);
    expect(result).toBeDefined();
    expect(result!.name).toBe("v0.9.0 — Milestone Validation");
    expect(result!.version).toBe("0.9.0");
    expect(result!.status).toBe("In Progress");
    expect(result!.tddReferences).toEqual([7]);
    expect(result!.criteria).toEqual(["Check works", "Complete works"]);
  });

  it("returns undefined when no active milestone", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(join(dir, "docs", "MILESTONES.md"), "# Milestones\n");

    expect(parseActiveMilestone(dir)).toBeUndefined();
  });

  it("returns undefined when MILESTONES.md missing", () => {
    const dir = makeTempDir();
    expect(parseActiveMilestone(dir)).toBeUndefined();
  });
});
