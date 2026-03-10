import { describe, it, expect } from "vitest";
import { evaluateConsistency } from "./consistency.js";
import type { GeneratedDocs } from "../agent/generate/types.js";

describe("consistency evaluator", () => {
  it("scores high when project name is consistent across docs", () => {
    const docs: Required<GeneratedDocs> = {
      vision: "# ChoreTracker Vision\n\nChoreTracker manages household tasks.",
      prd: "# ChoreTracker PRD\n\nChoreTracker requirements.",
      architecture:
        "# ChoreTracker Architecture\n\nChoreTracker system design.",
      milestones: "# ChoreTracker Milestones\n\nChoreTracker roadmap.",
    };

    const result = evaluateConsistency(docs);
    expect(result.score).toBeGreaterThan(0.8);
  });

  it("penalizes when project name differs across docs", () => {
    const docs: Required<GeneratedDocs> = {
      vision: "# ChoreTracker Vision\n\nChoreTracker manages tasks.",
      prd: "# TaskMaster PRD\n\nTaskMaster requirements.",
      architecture: "# ChoreApp Architecture\n\nChoreApp system.",
      milestones: "# HomeTasks Milestones\n\nHomeTasks roadmap.",
    };

    const result = evaluateConsistency(docs);
    expect(result.score).toBeLessThan(0.8);
    expect(
      result.diagnostics.some((d) => d.message.toLowerCase().includes("name")),
    ).toBe(true);
  });

  it("checks that milestones reference PRD requirements", () => {
    const docs: Required<GeneratedDocs> = {
      vision: "# Vision\n\nA task tracker.",
      prd: "# PRD\n\n## Requirements\n\n- User authentication\n- Task CRUD",
      architecture: "# Architecture\n\nSystem overview.",
      milestones:
        "# Milestones\n\n## v0.1.0\n\n**Goal:** Build task CRUD and user authentication.\n\n### Acceptance Criteria\n\n1. Users can create tasks\n2. Users can authenticate",
    };

    const result = evaluateConsistency(docs);
    expect(result.score).toBeGreaterThan(0.5);
  });

  it("handles empty docs gracefully", () => {
    const docs: Required<GeneratedDocs> = {
      vision: "",
      prd: "",
      architecture: "",
      milestones: "",
    };

    const result = evaluateConsistency(docs);
    expect(result.score).toBe(0);
  });
});
