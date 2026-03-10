import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../../test-utils.js";
import { milestoneTddConsistencyCheck } from "./milestone-tdd-consistency.js";

describe("milestone-tdd-consistency", () => {
  const makeTempDir = useTempDir("ms-tdd");

  const setup = (milestones: string, tdds?: Record<string, string>): string => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "docs", "tdd"), { recursive: true });
    writeFileSync(join(dir, "docs", "MILESTONES.md"), milestones);
    if (tdds) {
      for (const [name, content] of Object.entries(tdds)) {
        writeFileSync(join(dir, "docs", "tdd", name), content);
      }
    }
    return dir;
  };

  it("passes when no TDD references exist", () => {
    const dir = setup("## v0.1.0\n\n**Status:** Complete\n\n---\n");
    const result = milestoneTddConsistencyCheck.run(dir);
    expect(result.passed).toBe(true);
  });

  it("passes when complete milestone references accepted TDD", () => {
    const dir = setup(
      "## v0.2.0\n\n**Status:** Complete\n\n**Reference:** TDD-001\n\n---\n",
      { "TDD-001-init.md": "# TDD-001\n\n**Status:** Accepted\n" },
    );
    const result = milestoneTddConsistencyCheck.run(dir);
    expect(result.passed).toBe(true);
  });

  it("warns when complete milestone references draft TDD", () => {
    const dir = setup(
      "## v0.2.0\n\n**Status:** Complete\n\n**Reference:** TDD-001\n\n---\n",
      { "TDD-001-init.md": "# TDD-001\n\n**Status:** Draft\n" },
    );
    const result = milestoneTddConsistencyCheck.run(dir);
    expect(result.passed).toBe(false);
    expect(result.details[0]).toContain("TDD-001");
    expect(result.details[0]).toContain("Draft");
  });

  it("passes when in-progress milestone references draft TDD", () => {
    const dir = setup(
      "## v0.2.0\n\n**Status:** In Progress\n\n**Reference:** TDD-001\n\n---\n",
      { "TDD-001-init.md": "# TDD-001\n\n**Status:** Draft\n" },
    );
    const result = milestoneTddConsistencyCheck.run(dir);
    expect(result.passed).toBe(true);
  });

  it("passes gracefully when MILESTONES.md is missing", () => {
    const dir = makeTempDir();
    const result = milestoneTddConsistencyCheck.run(dir);
    expect(result.passed).toBe(true);
    expect(result.message).toContain("skipped");
  });

  it("reports missing TDD file", () => {
    const dir = setup(
      "## v0.2.0\n\n**Status:** Complete\n\n**Reference:** TDD-099\n\n---\n",
    );
    const result = milestoneTddConsistencyCheck.run(dir);
    expect(result.passed).toBe(false);
    expect(result.details[0]).toContain("TDD-099");
    expect(result.details[0]).toContain("not found");
  });

  it("handles missing tdd directory gracefully", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(
      join(dir, "docs", "MILESTONES.md"),
      "## v0.2.0\n\n**Status:** Complete\n\n**Reference:** TDD-001\n\n---\n",
    );
    const result = milestoneTddConsistencyCheck.run(dir);
    expect(result.passed).toBe(false);
    expect(result.details[0]).toContain("not found");
  });

  it("handles multiple TDD references on one milestone", () => {
    const dir = setup(
      "## v0.2.0\n\n**Status:** Complete\n\n**Reference:** TDD-001, TDD-002\n\n---\n",
      {
        "TDD-001-init.md": "# TDD-001\n\n**Status:** Accepted\n",
        "TDD-002-drift.md": "# TDD-002\n\n**Status:** Draft\n",
      },
    );
    const result = milestoneTddConsistencyCheck.run(dir);
    expect(result.passed).toBe(false);
    expect(result.details).toHaveLength(1);
    expect(result.details[0]).toContain("TDD-002");
  });
});
