import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { save } from "../../config/config.js";
import type { Config } from "../../config/config.js";
import { assembleReviewContext } from "./context.js";
import { appendNote } from "../../notes/store.js";
import { useTempDir } from "../../test-utils.js";

const makeTempDir = useTempDir("review-context-test");

const setupProject = (rootDir: string): void => {
  const cfg: Config = {
    project: {
      name: "TestProject",
      owner: "Test Owner",
      language: "TypeScript",
      status: "active",
      repo: "",
    },
  };
  save(rootDir, cfg);
  mkdirSync(join(rootDir, "docs", "adr"), { recursive: true });
  mkdirSync(join(rootDir, "docs", "tdd"), { recursive: true });
  mkdirSync(join(rootDir, "docs", "context"), { recursive: true });
};

describe("assembleReviewContext", () => {
  it("returns project metadata", () => {
    const dir = makeTempDir();
    setupProject(dir);

    const ctx = assembleReviewContext(dir);
    expect(ctx.projectName).toBe("TestProject");
    expect(ctx.primaryLanguage).toBe("TypeScript");
  });

  it("produces generic criteria when no docs exist", () => {
    const dir = makeTempDir();
    setupProject(dir);

    const ctx = assembleReviewContext(dir);
    expect(ctx.conventions).toContain("general code review best practices");
  });

  it("extracts architecture rules", () => {
    const dir = makeTempDir();
    setupProject(dir);

    writeFileSync(
      join(dir, "docs", "ARCHITECTURE.md"),
      `# Architecture

## Package Discipline

Only src/cli/ imports Commander.

---

## Other Section

Irrelevant content.
`,
    );

    const ctx = assembleReviewContext(dir);
    expect(ctx.conventions).toContain("Only src/cli/ imports Commander");
    expect(ctx.conventions).not.toContain("Irrelevant content");
  });

  it("extracts working conventions from context files", () => {
    const dir = makeTempDir();
    setupProject(dir);

    writeFileSync(
      join(dir, "docs", "context", "conventions.md"),
      "## Working Conventions\n\nPrefer interfaces over types.\n",
    );

    const ctx = assembleReviewContext(dir);
    expect(ctx.conventions).toContain("Prefer interfaces over types");
  });

  it("includes active ADR decisions, skips superseded", () => {
    const dir = makeTempDir();
    setupProject(dir);

    writeFileSync(
      join(dir, "docs", "adr", "ADR-001-old.md"),
      `# ADR-001 — Old Decision

**Status:** Superseded by ADR-002

## Decision

Use Go for everything.
`,
    );

    writeFileSync(
      join(dir, "docs", "adr", "ADR-002-new.md"),
      `# ADR-002 — New Decision

**Status:** Accepted

## Decision

Use TypeScript for everything.
`,
    );

    const ctx = assembleReviewContext(dir);
    expect(ctx.conventions).toContain("Use TypeScript for everything");
    expect(ctx.conventions).not.toContain("Use Go for everything");
  });

  it("includes TDD design decisions", () => {
    const dir = makeTempDir();
    setupProject(dir);

    writeFileSync(
      join(dir, "docs", "tdd", "TDD-001-init.md"),
      `# TDD-001 — Init Agent

## Decisions

1. Single-pass generation.
2. No streaming for generation calls.
`,
    );

    const ctx = assembleReviewContext(dir);
    expect(ctx.conventions).toContain("Single-pass generation");
  });

  it("includes development notes", () => {
    const dir = makeTempDir();
    setupProject(dir);

    appendNote(dir, "SSH required for workflow scope", ["git"]);

    const ctx = assembleReviewContext(dir);
    expect(ctx.conventions).toContain("SSH required for workflow scope");
    expect(ctx.conventions).toContain("[git]");
  });

  it("extracts PRD command contracts", () => {
    const dir = makeTempDir();
    setupProject(dir);

    writeFileSync(
      join(dir, "docs", "PRD.md"),
      `# Product Requirements

## Commands

### \`telesis init\`

Initializes a new project context.

### \`telesis review\`

Reviews code changes against project conventions.

---

## Other Section

Irrelevant.
`,
    );

    const ctx = assembleReviewContext(dir);
    expect(ctx.conventions).toContain("Initializes a new project context");
    expect(ctx.conventions).toContain("Reviews code changes");
    expect(ctx.conventions).not.toContain("Irrelevant");
  });

  it("assembles multiple doc sources together", () => {
    const dir = makeTempDir();
    setupProject(dir);

    writeFileSync(
      join(dir, "docs", "ARCHITECTURE.md"),
      "# Arch\n\n## Package Discipline\n\nRule A.\n\n---\n",
    );
    writeFileSync(join(dir, "docs", "context", "style.md"), "Style B.\n");

    const ctx = assembleReviewContext(dir);
    expect(ctx.conventions).toContain("Rule A");
    expect(ctx.conventions).toContain("Style B");
  });

  it("truncates conventions exceeding size cap", () => {
    const dir = makeTempDir();
    setupProject(dir);

    // Write a convention file large enough to exceed the 50,000 char cap
    const largeContent = "x".repeat(60_000);
    writeFileSync(join(dir, "docs", "context", "huge.md"), largeContent);

    const ctx = assembleReviewContext(dir);
    expect(ctx.conventions.length).toBeLessThanOrEqual(50_000);
  });
});
