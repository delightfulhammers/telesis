import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../test-utils.js";
import {
  savePipelineState,
  loadPipelineState,
  removePipelineState,
} from "./state.js";
import type { PipelineState } from "./types.js";

const makeTempDir = useTempDir("pipeline-state");

const makeState = (overrides?: Partial<PipelineState>): PipelineState => ({
  workItemId: "wi-test-1234-5678-9012-abcdef012345",
  planId: "plan-test-1234-5678-9012-abcdef012345",
  currentStage: "executing",
  startedAt: "2026-03-14T00:00:00Z",
  updatedAt: "2026-03-14T00:01:00Z",
  ...overrides,
});

describe("savePipelineState", () => {
  it("creates directory and file", () => {
    const dir = makeTempDir();
    const state = makeState();

    savePipelineState(dir, state);

    const filePath = join(
      dir,
      ".telesis",
      "pipelines",
      `${state.workItemId}.json`,
    );
    expect(existsSync(filePath)).toBe(true);
  });

  it("overwrites existing state", () => {
    const dir = makeTempDir();
    const state1 = makeState({ currentStage: "executing" });
    const state2 = makeState({ currentStage: "committing" });

    savePipelineState(dir, state1);
    savePipelineState(dir, state2);

    const loaded = loadPipelineState(dir, state1.workItemId);
    expect(loaded?.currentStage).toBe("committing");
  });
});

describe("loadPipelineState", () => {
  it("returns null for nonexistent file", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".telesis", "pipelines"), { recursive: true });

    const result = loadPipelineState(dir, "nonexistent-id");
    expect(result).toBeNull();
  });

  it("returns null for nonexistent directory", () => {
    const dir = makeTempDir();

    const result = loadPipelineState(dir, "nonexistent-id");
    expect(result).toBeNull();
  });

  it("returns parsed state for valid file", () => {
    const dir = makeTempDir();
    const state = makeState({
      preExecutionSha: "abc123",
      branch: "telesis/wi-test-add-auth",
    });

    savePipelineState(dir, state);

    const loaded = loadPipelineState(dir, state.workItemId);
    expect(loaded).toEqual(state);
  });

  it("returns null for corrupt JSON", () => {
    const dir = makeTempDir();
    const pipelinesPath = join(dir, ".telesis", "pipelines");
    mkdirSync(pipelinesPath, { recursive: true });
    writeFileSync(join(pipelinesPath, "bad-id.json"), "not json{{{");

    const result = loadPipelineState(dir, "bad-id");
    expect(result).toBeNull();
  });

  it("returns null for valid JSON with missing required fields", () => {
    const dir = makeTempDir();
    const pipelinesPath = join(dir, ".telesis", "pipelines");
    mkdirSync(pipelinesPath, { recursive: true });
    writeFileSync(
      join(pipelinesPath, "partial-id.json"),
      JSON.stringify({ workItemId: "partial-id" }),
    );

    const result = loadPipelineState(dir, "partial-id");
    expect(result).toBeNull();
  });

  it("returns null for invalid stage value", () => {
    const dir = makeTempDir();
    const pipelinesPath = join(dir, ".telesis", "pipelines");
    mkdirSync(pipelinesPath, { recursive: true });
    writeFileSync(
      join(pipelinesPath, "bad-stage.json"),
      JSON.stringify({
        workItemId: "bad-stage",
        planId: "plan-1",
        currentStage: "invalid_stage",
        startedAt: "2026-03-14T00:00:00Z",
        updatedAt: "2026-03-14T00:00:00Z",
      }),
    );

    const result = loadPipelineState(dir, "bad-stage");
    expect(result).toBeNull();
  });
});

describe("removePipelineState", () => {
  it("deletes existing state file", () => {
    const dir = makeTempDir();
    const state = makeState();

    savePipelineState(dir, state);
    removePipelineState(dir, state.workItemId);

    const loaded = loadPipelineState(dir, state.workItemId);
    expect(loaded).toBeNull();
  });

  it("is no-op when file does not exist", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".telesis", "pipelines"), { recursive: true });

    // Should not throw
    expect(() => removePipelineState(dir, "nonexistent")).not.toThrow();
  });

  it("is no-op when directory does not exist", () => {
    const dir = makeTempDir();

    expect(() => removePipelineState(dir, "nonexistent")).not.toThrow();
  });
});

describe("path traversal protection", () => {
  it("rejects workItemId with path traversal characters", () => {
    const dir = makeTempDir();
    const state = makeState({ workItemId: "../../etc/evil" });

    expect(() => savePipelineState(dir, state)).toThrow(
      "Invalid workItemId for state path",
    );
  });

  it("rejects workItemId with slashes", () => {
    const dir = makeTempDir();

    expect(() => loadPipelineState(dir, "foo/bar")).toThrow(
      "Invalid workItemId for state path",
    );
  });
});

describe("round-trip", () => {
  it("save then load yields identical state", () => {
    const dir = makeTempDir();
    const state = makeState({
      preExecutionSha: "abc123def456",
      branch: "telesis/wi-test-add-auth",
      commitResult: {
        sha: "def456abc789",
        branch: "telesis/wi-test-add-auth",
        message: "feat: Add auth",
        filesChanged: 5,
      },
      qualityGateSummary: {
        ran: true,
        passed: true,
        results: [{ gate: "lint", passed: true, durationMs: 1000 }],
      },
      reviewSummary: {
        ran: true,
        passed: true,
        totalFindings: 2,
        blockingFindings: 0,
        threshold: "high",
        findings: [],
      },
      pushResult: {
        branch: "telesis/wi-test-add-auth",
        remote: "origin",
      },
      prUrl: "https://github.com/owner/repo/pull/99",
    });

    savePipelineState(dir, state);
    const loaded = loadPipelineState(dir, state.workItemId);

    expect(loaded).toEqual(state);
  });
});
