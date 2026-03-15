import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { useTempDir } from "../test-utils.js";
import { assembleDispatchContext, formatContextPrompt } from "./context.js";

const makeTempDir = useTempDir("dispatch-context");

/** Set up a minimal project fixture for context assembly */
const setupProject = (
  root: string,
  overrides: {
    vision?: string;
    architecture?: string;
    milestones?: string;
    config?: string;
    claudeMd?: string;
    notes?: string;
    adr?: Record<string, string>;
    conventions?: Record<string, string>;
  } = {},
): void => {
  mkdirSync(join(root, ".telesis"), { recursive: true });
  mkdirSync(join(root, "docs", "adr"), { recursive: true });
  mkdirSync(join(root, "docs", "tdd"), { recursive: true });
  mkdirSync(join(root, "docs", "context"), { recursive: true });

  writeFileSync(
    join(root, ".telesis", "config.yml"),
    overrides.config ??
      `project:
  name: TestProject
  owner: TestOwner
  languages:
    - TypeScript
  status: active
  repo: github.com/test/test`,
  );

  if (overrides.vision !== undefined) {
    writeFileSync(join(root, "docs", "VISION.md"), overrides.vision);
  }
  if (overrides.architecture !== undefined) {
    writeFileSync(
      join(root, "docs", "ARCHITECTURE.md"),
      overrides.architecture,
    );
  }
  if (overrides.milestones !== undefined) {
    writeFileSync(join(root, "docs", "MILESTONES.md"), overrides.milestones);
  }
  if (overrides.claudeMd !== undefined) {
    writeFileSync(join(root, "CLAUDE.md"), overrides.claudeMd);
  }
  if (overrides.notes !== undefined) {
    writeFileSync(join(root, ".telesis", "notes.jsonl"), overrides.notes);
  }
  if (overrides.adr) {
    for (const [name, content] of Object.entries(overrides.adr)) {
      writeFileSync(join(root, "docs", "adr", name), content);
    }
  }
  if (overrides.conventions) {
    for (const [name, content] of Object.entries(overrides.conventions)) {
      writeFileSync(join(root, "docs", "context", name), content);
    }
  }
};

describe("assembleDispatchContext", () => {
  it("assembles context from a complete project", () => {
    const root = makeTempDir();
    setupProject(root, {
      vision: "# TestProject — Vision\n\nBuild great things.\n",
      architecture: "# Architecture\n\nTypeScript monorepo.\n",
      milestones: [
        "# Milestones",
        "",
        "## v0.1.0 — MVP",
        "**Status:** Complete",
        "",
        "## v0.2.0 — Feature X",
        "**Status:** In Progress",
        "### Acceptance Criteria",
        "1. Feature works",
      ].join("\n"),
      claudeMd: "# TestProject — Claude Context\nProject info here.",
      notes: JSON.stringify({
        id: "n1",
        timestamp: "2026-03-12T00:00:00Z",
        text: "Use strict mode",
        tags: ["config"],
      }),
    });

    const ctx = assembleDispatchContext(root);

    expect(ctx.projectName).toBe("TestProject");
    expect(ctx.primaryLanguage).toBe("TypeScript");
    expect(ctx.vision).toContain("Build great things");
    expect(ctx.architecture).toContain("TypeScript monorepo");
    expect(ctx.activeMilestone).toContain("v0.2.0");
    expect(ctx.activeMilestone).toContain("Feature works");
    expect(ctx.claudeMd).toContain("TestProject — Claude Context");
    expect(ctx.notes).toContain("Use strict mode");
  });

  it("handles missing optional docs gracefully", () => {
    const root = makeTempDir();
    setupProject(root);

    const ctx = assembleDispatchContext(root);

    expect(ctx.projectName).toBe("TestProject");
    expect(ctx.vision).toBe("");
    expect(ctx.architecture).toBe("");
    expect(ctx.activeMilestone).toBe("");
    expect(ctx.claudeMd).toBe("");
    expect(ctx.notes).toBe("");
  });

  it("extracts active (non-superseded) ADR summaries", () => {
    const root = makeTempDir();
    setupProject(root, {
      adr: {
        "ADR-001-active.md": [
          "# ADR-001 — Use TypeScript",
          "**Status:** Accepted",
          "## Decision",
          "Use TypeScript for everything.",
        ].join("\n"),
        "ADR-002-old.md": [
          "# ADR-002 — Use Go",
          "**Status:** Superseded by ADR-001",
          "## Decision",
          "Use Go. (no longer valid)",
        ].join("\n"),
      },
    });

    const ctx = assembleDispatchContext(root);

    expect(ctx.activeAdrs).toContain("Use TypeScript for everything");
    expect(ctx.activeAdrs).not.toContain("Use Go");
  });

  it("extracts conventions from docs/context/", () => {
    const root = makeTempDir();
    setupProject(root, {
      conventions: {
        "01-coding.md": "Always use strict mode.",
        "02-testing.md": "Tests colocated with source.",
      },
    });

    const ctx = assembleDispatchContext(root);

    expect(ctx.conventions).toContain("Always use strict mode");
    expect(ctx.conventions).toContain("Tests colocated with source");
  });

  it("skips complete milestones when finding active", () => {
    const root = makeTempDir();
    setupProject(root, {
      milestones: [
        "# Milestones",
        "",
        "## v0.1.0",
        "**Status:** Complete",
        "",
        "## v0.2.0",
        "**Status:** Complete",
        "",
        "## v0.3.0 — The Active One",
        "**Status:** In Progress",
        "Build the thing.",
      ].join("\n"),
    });

    const ctx = assembleDispatchContext(root);

    expect(ctx.activeMilestone).toContain("v0.3.0");
    expect(ctx.activeMilestone).toContain("Build the thing");
    expect(ctx.activeMilestone).not.toContain("v0.1.0");
    expect(ctx.activeMilestone).not.toContain("v0.2.0");
  });
});

describe("formatContextPrompt", () => {
  it("formats context into a prompt string", () => {
    const ctx = {
      projectName: "TestProject",
      primaryLanguage: "TypeScript",
      vision: "Build great things.",
      architecture: "Monorepo.",
      conventions: "Use strict mode.",
      activeMilestone: "## v0.2.0\nBuild the thing.",
      activeAdrs: "### ADR-001\nUse TypeScript.",
      notes: "- [config] Use strict mode",
      claudeMd: "# TestProject — Context",
    };

    const prompt = formatContextPrompt(ctx);

    expect(prompt).toContain("# Project: TestProject");
    expect(prompt).toContain("Primary language: TypeScript");
    expect(prompt).toContain("TestProject — Context");
    expect(prompt).toContain("v0.2.0");
    expect(prompt).toContain("ADR-001");
    expect(prompt).toContain("Use strict mode");
  });

  it("omits empty sections", () => {
    const ctx = {
      projectName: "TestProject",
      primaryLanguage: "TypeScript",
      vision: "",
      architecture: "",
      conventions: "",
      activeMilestone: "",
      activeAdrs: "",
      notes: "",
      claudeMd: "",
    };

    const prompt = formatContextPrompt(ctx);

    expect(prompt).toContain("# Project: TestProject");
    expect(prompt).not.toContain("Active Milestone");
    expect(prompt).not.toContain("Architectural Decisions");
    expect(prompt).not.toContain("Development Notes");
  });
});
