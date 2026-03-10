import { describe, it, expect } from "vitest";
import { evaluateActionability } from "./actionability.js";
import type { DocumentType } from "../agent/generate/types.js";

const score = (doc: DocumentType, content: string) =>
  evaluateActionability(doc, content);

describe("actionability evaluator", () => {
  describe("milestones", () => {
    it("scores high for milestones with numbered ACs and build sequence", () => {
      const actionable = `# Milestones

## MVP v0.1.0

**Goal:** Build the core task CRUD and authentication.

**Status:** In Progress

### Acceptance Criteria

1. Users can create, read, update, and delete tasks via the CLI
2. Tasks persist to a local SQLite database
3. User authentication via email/password
4. \`task list\` shows all tasks sorted by due date

### Build Sequence

1. **Phase 1 — Data layer:** SQLite schema, task model, CRUD operations
2. **Phase 2 — Auth:** User registration, login, session management
3. **Phase 3 — CLI:** Wire commands to business logic

## Future Milestones

### v0.2.0

**Goal:** Add recurring tasks.
`;

      const result = score("milestones", actionable);
      expect(result.score).toBeGreaterThan(0.8);
    });

    it("scores low for milestones without numbered criteria", () => {
      const vague = `# Milestones

## MVP v0.1.0

**Goal:** Build the first version.

**Status:** In Progress

We will build the basic features first and then add more later.
The system should work well and be easy to use.

## Future Milestones

More stuff to come.
`;

      const result = score("milestones", vague);
      expect(result.score).toBeLessThan(0.5);
      expect(result.diagnostics.length).toBeGreaterThan(0);
    });

    it("penalizes few acceptance criteria", () => {
      const fewAC = `# Milestones

## MVP v0.1.0

**Goal:** Build it.

**Status:** In Progress

### Acceptance Criteria

1. It works

### Build Sequence

1. Build everything
`;

      const result = score("milestones", fewAC);
      expect(result.score).toBeLessThan(0.8);
    });
  });

  describe("prd", () => {
    it("scores high for PRD with specific requirements", () => {
      const specific = `# PRD

## Overview

Task management tool.

## User Journeys

### Creating a task

1. User runs \`task create "Buy groceries" --due tomorrow\`
2. System validates the due date
3. Task is saved and confirmed

## Requirements

### Task Management

- Users can create tasks with title and optional due date
- Tasks can be marked as complete
- Completed tasks are hidden from default list view

### Authentication

- Email/password registration
- Session tokens expire after 24 hours

## Non-functional Requirements

- CLI response time under 200ms for local operations
- Database supports up to 10,000 tasks per user

## Success Criteria

1. User can complete the full create-list-complete workflow in under 30 seconds
2. Zero data loss during normal operation
`;

      const result = score("prd", specific);
      expect(result.score).toBeGreaterThan(0.7);
    });
  });

  describe("non-actionable document types", () => {
    it("returns 1.0 for vision (not an actionable doc type)", () => {
      const result = score("vision", "# Vision\n\nSome content.");
      expect(result.score).toBe(1.0);
      expect(result.diagnostics).toHaveLength(0);
    });

    it("returns 1.0 for architecture", () => {
      const result = score("architecture", "# Architecture\n\nSome content.");
      expect(result.score).toBe(1.0);
    });
  });

  it("handles empty content", () => {
    const result = score("milestones", "");
    expect(result.score).toBe(0);
  });
});
