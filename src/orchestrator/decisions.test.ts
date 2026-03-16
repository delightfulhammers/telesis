import { describe, it, expect } from "vitest";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  createDecision,
  resolveDecision,
  listPendingDecisions,
  loadDecision,
} from "./decisions.js";
import type { DecisionKind } from "./types.js";
import { useTempDir } from "../test-utils.js";

const makeTempDir = useTempDir("orchestrator-decisions-test");

const setupProject = (rootDir: string): void => {
  mkdirSync(join(rootDir, ".telesis"), { recursive: true });
};

describe("decisions", () => {
  it("creates a pending decision", () => {
    const dir = makeTempDir();
    setupProject(dir);

    const decision = createDecision(dir, {
      kind: "plan_approval",
      summary: "Approve task plan for v0.22.0",
      detail: '{"tasks": 5}',
    });

    expect(decision.id).toBeDefined();
    expect(decision.kind).toBe("plan_approval");
    expect(decision.summary).toBe("Approve task plan for v0.22.0");
    expect(decision.resolvedAt).toBeUndefined();
    expect(decision.resolution).toBeUndefined();
  });

  it("lists only pending decisions", () => {
    const dir = makeTempDir();
    setupProject(dir);

    const d1 = createDecision(dir, {
      kind: "plan_approval",
      summary: "Approve plan",
      detail: "{}",
    });
    createDecision(dir, {
      kind: "ship_confirmation",
      summary: "Ship it?",
      detail: "{}",
    });

    // Resolve one
    resolveDecision(dir, d1.id, "approved");

    const pending = listPendingDecisions(dir);
    expect(pending).toHaveLength(1);
    expect(pending[0].kind).toBe("ship_confirmation");
  });

  it("loads a specific decision by ID", () => {
    const dir = makeTempDir();
    setupProject(dir);

    const created = createDecision(dir, {
      kind: "escalation",
      summary: "Task failed after retries",
      detail: '{"taskId": "task-1"}',
    });

    const loaded = loadDecision(dir, created.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.kind).toBe("escalation");
    expect(loaded!.summary).toBe("Task failed after retries");
  });

  it("returns null for nonexistent decision", () => {
    const dir = makeTempDir();
    setupProject(dir);

    const loaded = loadDecision(dir, "nonexistent-id");
    expect(loaded).toBeNull();
  });

  it("resolves a decision as approved", () => {
    const dir = makeTempDir();
    setupProject(dir);

    const created = createDecision(dir, {
      kind: "triage_approval",
      summary: "Approve milestone scope",
      detail: "{}",
    });

    const resolved = resolveDecision(dir, created.id, "approved");
    expect(resolved.resolution).toBe("approved");
    expect(resolved.resolvedAt).toBeDefined();
    expect(resolved.reason).toBeUndefined();
  });

  it("resolves a decision as rejected with reason", () => {
    const dir = makeTempDir();
    setupProject(dir);

    const created = createDecision(dir, {
      kind: "plan_approval",
      summary: "Approve plan",
      detail: "{}",
    });

    const resolved = resolveDecision(
      dir,
      created.id,
      "rejected",
      "Tasks are too coarse-grained",
    );
    expect(resolved.resolution).toBe("rejected");
    expect(resolved.reason).toBe("Tasks are too coarse-grained");
  });

  it("resolves a decision by ID prefix", () => {
    const dir = makeTempDir();
    setupProject(dir);

    const created = createDecision(dir, {
      kind: "plan_approval",
      summary: "Approve plan",
      detail: "{}",
    });

    const prefix = created.id.slice(0, 8);
    const resolved = resolveDecision(dir, prefix, "approved");
    expect(resolved.resolution).toBe("approved");
    expect(resolved.id).toBe(created.id);
  });

  it("loads a decision by prefix", () => {
    const dir = makeTempDir();
    setupProject(dir);

    const created = createDecision(dir, {
      kind: "triage_approval",
      summary: "Approve triage",
      detail: "{}",
    });

    const prefix = created.id.slice(0, 8);
    const loaded = loadDecision(dir, prefix);
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(created.id);
  });

  it("throws when resolving nonexistent decision", () => {
    const dir = makeTempDir();
    setupProject(dir);

    expect(() => resolveDecision(dir, "bad-id", "approved")).toThrow();
  });

  it("throws when resolving already-resolved decision", () => {
    const dir = makeTempDir();
    setupProject(dir);

    const created = createDecision(dir, {
      kind: "ship_confirmation",
      summary: "Ship it?",
      detail: "{}",
    });

    resolveDecision(dir, created.id, "approved");
    expect(() => resolveDecision(dir, created.id, "approved")).toThrow(
      "already resolved",
    );
  });
});
