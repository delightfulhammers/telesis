import { describe, it, expect } from "vitest";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { saveContext, loadContext } from "./persistence.js";
import { createContext, transition } from "./machine.js";
import type { OrchestratorContext } from "./types.js";
import { useTempDir } from "../test-utils.js";

const makeTempDir = useTempDir("orchestrator-persistence-test");

const setupProject = (rootDir: string): void => {
  mkdirSync(join(rootDir, ".telesis"), { recursive: true });
};

describe("persistence", () => {
  it("round-trips context through save/load", () => {
    const dir = makeTempDir();
    setupProject(dir);

    const ctx = createContext();
    const advanced = transition(ctx, "intake").context;

    saveContext(dir, advanced);
    const loaded = loadContext(dir);

    expect(loaded).not.toBeNull();
    expect(loaded!.state).toBe("intake");
    expect(loaded!.workItemIds).toEqual([]);
    expect(loaded!.updatedAt).toBe(advanced.updatedAt);
  });

  it("returns null when no persisted state exists", () => {
    const dir = makeTempDir();
    setupProject(dir);

    const loaded = loadContext(dir);
    expect(loaded).toBeNull();
  });

  it("preserves all context fields", () => {
    const dir = makeTempDir();
    setupProject(dir);

    const ctx: OrchestratorContext = {
      state: "reviewing",
      milestoneId: "0.22.0",
      milestoneName: "Orchestrator",
      workItemIds: ["wi-1", "wi-2"],
      planId: "plan-1",
      currentTaskIndex: 3,
      reviewRound: 2,
      reviewFindings: 5,
      startedAt: "2026-03-15T10:00:00Z",
      updatedAt: "2026-03-15T12:00:00Z",
    };

    saveContext(dir, ctx);
    const loaded = loadContext(dir);

    expect(loaded).toEqual(ctx);
  });

  it("overwrites previous state on save", () => {
    const dir = makeTempDir();
    setupProject(dir);

    const ctx1 = createContext();
    saveContext(dir, ctx1);

    const ctx2 = transition(ctx1, "intake").context;
    saveContext(dir, ctx2);

    const loaded = loadContext(dir);
    expect(loaded!.state).toBe("intake");
  });
});
