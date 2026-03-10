import { describe, it, expect } from "vitest";
import { evaluateStructure } from "./structural.js";
import type { DocumentType } from "../agent/generate/types.js";

const score = (doc: DocumentType, content: string) =>
  evaluateStructure(doc, content);

describe("structural evaluator", () => {
  describe("vision", () => {
    const wellFormed = `# My Project

One-line tagline here.

## The Problem

There is a real problem described here.

## The Vision

Here is what the world looks like.

## Principles

1. First principle
2. Second principle
3. Third principle
4. Fourth principle

## What This Is / What This Isn't

**What This Is:** A thing.
**What This Isn't:** Not another thing.
`;

    it("scores 1.0 for a well-formed vision doc", () => {
      const result = score("vision", wellFormed);
      expect(result.score).toBe(1.0);
      expect(result.diagnostics).toHaveLength(0);
    });

    it("penalizes missing sections", () => {
      const incomplete = `# My Project

## The Problem

A problem.
`;
      const result = score("vision", incomplete);
      expect(result.score).toBeLessThan(1.0);
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.diagnostics.some((d) => d.message.includes("Vision"))).toBe(
        true,
      );
    });

    it("penalizes empty sections", () => {
      const emptySections = `# My Project

## The Problem

## The Vision

Content here.

## Principles

1. A principle

## What This Is / What This Isn't

Scope here.
`;
      const result = score("vision", emptySections);
      expect(result.score).toBeLessThan(1.0);
      expect(
        result.diagnostics.some((d) => d.message.includes("Problem")),
      ).toBe(true);
    });
  });

  describe("prd", () => {
    const wellFormed = `# PRD

## Overview

A summary paragraph.

## User Journeys

### Journey 1

Step by step.

### Journey 2

Another workflow.

## Requirements

### Feature Area 1

- Requirement one
- Requirement two

## Non-functional Requirements

- Performance constraint

## Success Criteria

1. Measurable outcome
`;

    it("scores 1.0 for a well-formed PRD", () => {
      const result = score("prd", wellFormed);
      expect(result.score).toBe(1.0);
      expect(result.diagnostics).toHaveLength(0);
    });

    it("penalizes missing sections", () => {
      const result = score(
        "prd",
        "# PRD\n\n## Overview\n\nJust an overview.\n",
      );
      expect(result.score).toBeLessThan(1.0);
    });
  });

  describe("architecture", () => {
    const wellFormed = `# Architecture

## System Overview

High-level description.

## Components

### Component A

Responsibility.

## Data Flow

How data moves.

## Working Conventions

Code style rules.

## Key Decisions

Important choices.
`;

    it("scores 1.0 for a well-formed architecture doc", () => {
      const result = score("architecture", wellFormed);
      expect(result.score).toBe(1.0);
      expect(result.diagnostics).toHaveLength(0);
    });
  });

  describe("milestones", () => {
    const wellFormed = `# Milestones

## MVP v0.1.0

**Goal:** Build the first version.

**Status:** In Progress

### Acceptance Criteria

1. First criterion
2. Second criterion

### Build Sequence

1. Phase 1 — Do first thing
2. Phase 2 — Do second thing

## Future Milestones

### v0.2.0

**Goal:** Next step.
`;

    it("scores 1.0 for a well-formed milestones doc", () => {
      const result = score("milestones", wellFormed);
      expect(result.score).toBe(1.0);
      expect(result.diagnostics).toHaveLength(0);
    });

    it("penalizes missing acceptance criteria", () => {
      const noAC = `# Milestones

## MVP v0.1.0

**Goal:** Build it.

**Status:** In Progress

## Future Milestones

More stuff.
`;
      const result = score("milestones", noAC);
      expect(result.score).toBeLessThan(1.0);
      expect(
        result.diagnostics.some((d) =>
          d.message.toLowerCase().includes("acceptance criteria"),
        ),
      ).toBe(true);
    });

    it("penalizes missing build sequence", () => {
      const noBuild = `# Milestones

## MVP v0.1.0

**Goal:** Build it.

**Status:** In Progress

### Acceptance Criteria

1. First criterion

## Future Milestones

More.
`;
      const result = score("milestones", noBuild);
      expect(result.score).toBeLessThan(1.0);
      expect(
        result.diagnostics.some((d) =>
          d.message.toLowerCase().includes("build sequence"),
        ),
      ).toBe(true);
    });
  });

  it("handles empty content", () => {
    const result = score("vision", "");
    expect(result.score).toBe(0);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});
