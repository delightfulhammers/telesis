import { describe, it, expect, vi } from "vitest";
import { runQualityGates } from "./quality-gates.js";
import type { QualityGateDeps } from "./quality-gates.js";
import type { QualityGatesConfig } from "../config/config.js";
import type { CommitResult } from "../git/types.js";

const makeDeps = (overrides?: Partial<QualityGateDeps>): QualityGateDeps => ({
  rootDir: "/test",
  workItemId: "wi-test-1234",
  onEvent: vi.fn(),
  hasChanges: vi.fn(() => false),
  stageAll: vi.fn(),
  amendCommit: vi.fn(() => ({
    sha: "amended-sha-1234567890abcdef1234567890abcdef12345678",
    branch: "main",
    message: "test commit",
    filesChanged: 3,
  })),
  runDriftChecks: vi.fn(() => ({ passed: true })),
  execCommand: vi.fn(),
  ...overrides,
});

const amendedResult: CommitResult = {
  sha: "amended-sha-1234567890abcdef1234567890abcdef12345678",
  branch: "main",
  message: "test commit",
  filesChanged: 3,
};

describe("runQualityGates", () => {
  it("returns ran: false when config has no gates", () => {
    const deps = makeDeps();
    const { summary } = runQualityGates(deps, {});

    expect(summary.ran).toBe(false);
    expect(summary.passed).toBe(true);
    expect(summary.results).toEqual([]);
  });

  it("runs all configured gates in order", () => {
    const execCommand = vi.fn();
    const deps = makeDeps({ execCommand });
    const config: QualityGatesConfig = {
      format: "pnpm run format",
      lint: "pnpm run lint",
      test: "pnpm test",
      build: "pnpm run build",
      drift: true,
    };

    const { summary } = runQualityGates(deps, config);

    expect(summary.ran).toBe(true);
    expect(summary.passed).toBe(true);
    expect(summary.results).toHaveLength(5);
    expect(summary.results.map((r) => r.gate)).toEqual([
      "format",
      "lint",
      "test",
      "build",
      "drift",
    ]);

    // Shell gates called in order
    expect(execCommand).toHaveBeenCalledTimes(4);
    expect(execCommand).toHaveBeenNthCalledWith(1, "pnpm run format", "/test");
    expect(execCommand).toHaveBeenNthCalledWith(2, "pnpm run lint", "/test");
    expect(execCommand).toHaveBeenNthCalledWith(3, "pnpm test", "/test");
    expect(execCommand).toHaveBeenNthCalledWith(4, "pnpm run build", "/test");
  });

  it("skips null gates", () => {
    const execCommand = vi.fn();
    const deps = makeDeps({ execCommand });
    const config: QualityGatesConfig = {
      format: null,
      lint: "pnpm run lint",
      test: null,
    };

    const { summary } = runQualityGates(deps, config);

    expect(summary.ran).toBe(true);
    expect(summary.passed).toBe(true);
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].gate).toBe("lint");
    expect(execCommand).toHaveBeenCalledTimes(1);
  });

  it("amends commit when format gate modifies files", () => {
    const hasChanges = vi.fn(() => true);
    const stageAll = vi.fn();
    const amendCommit = vi.fn(() => amendedResult);
    const deps = makeDeps({ hasChanges, stageAll, amendCommit });
    const config: QualityGatesConfig = { format: "pnpm run format" };

    const { summary, amendedCommit } = runQualityGates(deps, config);

    expect(summary.ran).toBe(true);
    expect(summary.passed).toBe(true);
    expect(summary.results[0].gate).toBe("format");
    expect(summary.results[0].amended).toBe(true);
    expect(stageAll).toHaveBeenCalledWith("/test");
    expect(amendCommit).toHaveBeenCalledWith("/test");
    expect(amendedCommit).toBeDefined();
    expect(amendedCommit!.sha).toBe(amendedResult.sha);
  });

  it("does not amend when format gate makes no changes", () => {
    const hasChanges = vi.fn(() => false);
    const amendCommit = vi.fn();
    const deps = makeDeps({ hasChanges, amendCommit });
    const config: QualityGatesConfig = { format: "pnpm run format" };

    const { summary, amendedCommit } = runQualityGates(deps, config);

    expect(summary.passed).toBe(true);
    expect(summary.results[0].amended).toBeUndefined();
    expect(amendCommit).not.toHaveBeenCalled();
    expect(amendedCommit).toBeUndefined();
  });

  it("fails fast when lint gate fails", () => {
    const execCommand = vi.fn().mockImplementation((cmd: string) => {
      if (cmd === "pnpm run lint") {
        throw new Error("Lint errors found");
      }
    });
    const deps = makeDeps({ execCommand });
    const config: QualityGatesConfig = {
      format: "pnpm run format",
      lint: "pnpm run lint",
      test: "pnpm test",
    };

    const { summary } = runQualityGates(deps, config);

    expect(summary.ran).toBe(true);
    expect(summary.passed).toBe(false);
    expect(summary.results).toHaveLength(2);
    expect(summary.results[0].gate).toBe("format");
    expect(summary.results[0].passed).toBe(true);
    expect(summary.results[1].gate).toBe("lint");
    expect(summary.results[1].passed).toBe(false);
    expect(summary.results[1].error).toContain("Lint errors found");

    // test gate should not have been called
    expect(execCommand).toHaveBeenCalledTimes(2);
  });

  it("fails fast when test gate fails", () => {
    const execCommand = vi.fn().mockImplementation((cmd: string) => {
      if (cmd === "pnpm test") {
        throw new Error("Tests failed");
      }
    });
    const deps = makeDeps({ execCommand });
    const config: QualityGatesConfig = {
      lint: "pnpm run lint",
      test: "pnpm test",
      build: "pnpm run build",
    };

    const { summary } = runQualityGates(deps, config);

    expect(summary.passed).toBe(false);
    expect(summary.results).toHaveLength(2);
    expect(summary.results[1].gate).toBe("test");
    expect(summary.results[1].passed).toBe(false);
  });

  it("fails when drift checks fail", () => {
    const runDriftChecks = vi.fn(() => ({ passed: false }));
    const deps = makeDeps({ runDriftChecks });
    const config: QualityGatesConfig = { drift: true };

    const { summary } = runQualityGates(deps, config);

    expect(summary.passed).toBe(false);
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].gate).toBe("drift");
    expect(summary.results[0].passed).toBe(false);
    expect(summary.results[0].error).toContain("Drift checks failed");
  });

  it("skips drift when false", () => {
    const runDriftChecks = vi.fn();
    const deps = makeDeps({ runDriftChecks });
    const config: QualityGatesConfig = {
      lint: "pnpm run lint",
      drift: false,
    };

    const { summary } = runQualityGates(deps, config);

    expect(summary.passed).toBe(true);
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].gate).toBe("lint");
    expect(runDriftChecks).not.toHaveBeenCalled();
  });

  it("emits passed events for each successful gate", () => {
    const onEvent = vi.fn();
    const deps = makeDeps({ onEvent });
    const config: QualityGatesConfig = {
      lint: "pnpm run lint",
      test: "pnpm test",
    };

    runQualityGates(deps, config);

    expect(onEvent).toHaveBeenCalledTimes(2);
    const eventTypes = onEvent.mock.calls.map(
      (call: unknown[]) => (call[0] as { type: string }).type,
    );
    expect(eventTypes).toEqual([
      "pipeline:quality_gate_passed",
      "pipeline:quality_gate_passed",
    ]);
  });

  it("emits failed event on gate failure", () => {
    const onEvent = vi.fn();
    const execCommand = vi.fn().mockImplementation(() => {
      throw new Error("Build failed");
    });
    const deps = makeDeps({ onEvent, execCommand });
    const config: QualityGatesConfig = { build: "pnpm run build" };

    runQualityGates(deps, config);

    expect(onEvent).toHaveBeenCalledTimes(1);
    const event = onEvent.mock.calls[0][0] as {
      type: string;
      payload: { gate: string; error: string };
    };
    expect(event.type).toBe("pipeline:quality_gate_failed");
    expect(event.payload.gate).toBe("build");
    expect(event.payload.error).toContain("Build failed");
  });

  it("emits amended flag in event when format amends", () => {
    const onEvent = vi.fn();
    const deps = makeDeps({
      onEvent,
      hasChanges: vi.fn(() => true),
    });
    const config: QualityGatesConfig = { format: "pnpm run format" };

    runQualityGates(deps, config);

    const event = onEvent.mock.calls[0][0] as {
      type: string;
      payload: { amended: boolean };
    };
    expect(event.type).toBe("pipeline:quality_gate_passed");
    expect(event.payload.amended).toBe(true);
  });

  it("does not check hasChanges for non-format gates", () => {
    const hasChanges = vi.fn();
    const deps = makeDeps({ hasChanges });
    const config: QualityGatesConfig = {
      lint: "pnpm run lint",
      test: "pnpm test",
    };

    runQualityGates(deps, config);

    expect(hasChanges).not.toHaveBeenCalled();
  });
});
