import { describe, it, expect } from "vitest";
import { evaluate } from "./runner.js";
import type { EvalInput } from "./types.js";

const makeInput = (overrides?: Partial<EvalInput>): EvalInput => ({
  interviewState: {
    sessionId: "test-session",
    turns: [
      {
        role: "assistant",
        content: "What are you building?",
      },
      {
        role: "user",
        content:
          "A household chore management app called ChoreTracker. It's built with React Native and PostgreSQL. Families need a way to fairly distribute recurring chores among family members.",
      },
      {
        role: "assistant",
        content: "What are the main features?",
      },
      {
        role: "user",
        content:
          "Task creation with recurrence patterns, fair rotation algorithms, push notifications for reminders, and a family dashboard showing everyone's assignments.",
      },
    ],
    complete: true,
    turnCount: 2,
  },
  generatedDocs: {
    vision: `# ChoreTracker

A household chore management app for families.

## The Problem

Managing household chores across family members is chaotic. Shared calendars
don't capture recurring tasks, delegation, or completion tracking.

## The Vision

ChoreTracker makes household task delegation transparent and accountable
through fair rotation and visibility.

## Principles

1. **Family-friendly** — Every screen usable by a 10-year-old.
2. **Offline-first** — Works without internet; syncs when connected.
3. **Fair rotation** — Algorithms prevent the same person from always getting the worst chores.
4. **Positive framing** — Progress shown positively, never punitively.

## What This Is / What This Isn't

**What This Is:** A mobile-first family chore management app.
**What This Isn't:** A generic to-do list or project management tool.
`,
    prd: `# ChoreTracker PRD

## Overview

ChoreTracker is a mobile app for families to manage and fairly distribute
household chores.

## User Journeys

### Creating a recurring chore

1. Parent opens ChoreTracker
2. Taps "New Chore"
3. Sets recurrence pattern (daily, weekly, etc.)
4. Assigns to family members with rotation

### Viewing the dashboard

1. User opens the app
2. Sees today's assigned chores
3. Marks chores complete

## Requirements

### Task Management

- Create chores with title, description, and recurrence pattern
- Assign chores to family members
- Mark chores as complete
- View chore history

### Rotation

- Fair rotation algorithm distributes chores evenly
- Override rotation for specific assignments

### Notifications

- Push notifications for upcoming chores
- Configurable reminder timing

## Non-functional Requirements

- App loads in under 2 seconds on 4G
- Supports families up to 10 members
- Offline task completion syncs within 30 seconds of reconnection

## Success Criteria

1. Family can complete full onboarding in under 5 minutes
2. Chore completion rate increases by 20% vs manual tracking
`,
    architecture: `# ChoreTracker Architecture

## System Overview

React Native frontend communicating with a PostgreSQL backend via GraphQL.
Push notifications through Firebase Cloud Messaging.

## Components

### Mobile App

React Native with Expo. Handles UI, offline storage, and push notification
registration.

### API Server

Node.js with Apollo Server. GraphQL API for all data operations.

### Database

PostgreSQL with prisma ORM. Stores users, families, chores, assignments,
and completion records.

### Notification Service

Firebase Cloud Messaging for push notifications. Scheduled via cron jobs.

## Data Flow

1. User creates a chore → GraphQL mutation → API server → PostgreSQL
2. Rotation algorithm runs on assignment → queries history → distributes fairly
3. Notification scheduler queries upcoming chores → sends FCM push

## Working Conventions

- TypeScript throughout (frontend and backend)
- Prisma migrations for schema changes
- Jest for testing, Detox for E2E mobile tests

## Key Decisions

- **GraphQL over REST:** Flexible queries for family dashboard aggregations
- **Expo over bare RN:** Faster development, push notification abstraction
- **PostgreSQL over NoSQL:** Relational data (families, members, assignments) fits naturally
`,
    milestones: `# ChoreTracker Milestones

## MVP v0.1.0

**Goal:** Basic chore creation and family management.

**Status:** In Progress

### Acceptance Criteria

1. Users can create a family and invite members
2. Users can create chores with title and recurrence
3. Chores appear on the family dashboard
4. Users can mark chores as complete
5. Basic push notifications for upcoming chores

### Build Sequence

1. **Phase 1 — Data layer:** PostgreSQL schema, Prisma models, GraphQL resolvers
2. **Phase 2 — Mobile app:** React Native screens for chore CRUD and dashboard
3. **Phase 3 — Notifications:** Firebase integration, reminder scheduling

## Future Milestones

### v0.2.0

**Goal:** Fair rotation algorithm and chore history.

### v0.3.0

**Goal:** Family analytics and insights dashboard.
`,
  },
  ...overrides,
});

describe("evaluate (runner)", () => {
  it("produces a complete report with all quality axes", () => {
    const input = makeInput();
    const report = evaluate(input);

    expect(report.documents).toHaveLength(4);
    expect(report.overall).toBeGreaterThan(0);
    expect(report.overall).toBeLessThanOrEqual(1);

    // Each document should have scores for all axes
    for (const doc of report.documents) {
      expect(doc.axes.completeness).toBeDefined();
      expect(doc.axes.coverage).toBeDefined();
      expect(doc.axes.specificity).toBeDefined();
      expect(doc.axes.consistency).toBeDefined();
      expect(doc.axes.actionability).toBeDefined();
    }
  });

  it("scores high for well-crafted documents", () => {
    const input = makeInput();
    const report = evaluate(input);

    // The fixture documents are well-crafted — should score well
    expect(report.overall).toBeGreaterThan(0.7);
  });

  it("scores low for empty documents", () => {
    const input: EvalInput = {
      interviewState: {
        sessionId: "test",
        turns: [],
        complete: true,
        turnCount: 0,
      },
      generatedDocs: {
        vision: "",
        prd: "",
        architecture: "",
        milestones: "",
      },
    };

    const report = evaluate(input);
    // Not exactly 0 because coverage (vacuously 1.0 with no topics) and
    // actionability (1.0 for non-actionable doc types) are "not applicable"
    // and default to 1.0. The meaningful axes (completeness, specificity,
    // consistency) should all be 0 for empty docs.
    expect(report.overall).toBeLessThan(0.5);
    for (const doc of report.documents) {
      expect(doc.axes.completeness).toBe(0);
      expect(doc.axes.specificity).toBe(0);
      expect(doc.axes.consistency).toBe(0);
    }
  });

  it("collects diagnostics from all evaluators", () => {
    const input = makeInput({
      generatedDocs: {
        vision: "# Vision\n\nJust a brief note.",
        prd: "# PRD\n\nSome requirements.",
        architecture: "# Architecture\n\nOverview.",
        milestones: "# Milestones\n\nRoadmap.",
      },
    });

    const report = evaluate(input);
    expect(report.diagnostics.length).toBeGreaterThan(0);
  });

  it("per-document overall is average of per-document axes", () => {
    const input = makeInput();
    const report = evaluate(input);

    for (const doc of report.documents) {
      const axisValues = Object.values(doc.axes);
      const expectedOverall =
        axisValues.reduce((a, b) => a + b, 0) / axisValues.length;
      expect(doc.overall).toBeCloseTo(expectedOverall, 10);
    }
  });
});
