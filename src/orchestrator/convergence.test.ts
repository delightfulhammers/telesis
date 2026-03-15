import { describe, it, expect, vi } from "vitest";
import { runConvergenceLoop, type ConvergenceResult } from "./convergence.js";
import type { ReviewResult } from "../agent/review/pipeline.js";

const makeReviewResult = (
  findingCount: number,
  overrides: Partial<ReviewResult> = {},
): ReviewResult => {
  const findings = Array.from({ length: findingCount }, (_, i) => ({
    id: `f-${i}`,
    sessionId: "s-1",
    severity: (i === 0 ? "high" : "medium") as "high" | "medium",
    category: "bug" as const,
    path: `src/file-${i}.ts`,
    description: `Finding ${i}`,
    suggestion: `Fix ${i}`,
    confidence: 90,
  }));

  return {
    session: {
      id: "s-1",
      timestamp: "2026-03-15T00:00:00Z",
      ref: "staged",
      files: [],
      findingCount,
      model: "test",
      durationMs: 1000,
      tokenUsage: { inputTokens: 100, outputTokens: 50 },
      mode: "single",
    },
    findings,
    filterStats: {
      dismissalFilteredCount: 0,
      noiseFilteredCount: 0,
      antiPatternFilteredCount: 0,
      totalFilteredCount: 0,
    },
    cost: null,
    rawFindingCount: findingCount,
    ...overrides,
  };
};

describe("runConvergenceLoop", () => {
  it("converges immediately when review has no findings", async () => {
    const runReview = vi.fn().mockResolvedValue(makeReviewResult(0));
    const dispatchFix = vi.fn();
    const stageChanges = vi.fn();

    const result = await runConvergenceLoop({
      runReview,
      dispatchFix,
      stageChanges,
      maxRounds: 5,
      convergenceThreshold: 3,
    });

    expect(result.converged).toBe(true);
    expect(result.rounds).toBe(1);
    expect(result.finalFindings).toHaveLength(0);
    expect(dispatchFix).not.toHaveBeenCalled();
  });

  it("converges when findings drop below threshold", async () => {
    const runReview = vi
      .fn()
      .mockResolvedValueOnce(makeReviewResult(5))
      .mockResolvedValueOnce(makeReviewResult(2));
    const dispatchFix = vi.fn().mockResolvedValue(undefined);
    const stageChanges = vi.fn();

    const result = await runConvergenceLoop({
      runReview,
      dispatchFix,
      stageChanges,
      maxRounds: 5,
      convergenceThreshold: 3,
    });

    expect(result.converged).toBe(true);
    expect(result.rounds).toBe(2);
    expect(dispatchFix).toHaveBeenCalledOnce();
    expect(stageChanges).toHaveBeenCalled();
  });

  it("fails to converge after max rounds", async () => {
    const runReview = vi.fn().mockResolvedValue(makeReviewResult(5));
    const dispatchFix = vi.fn().mockResolvedValue(undefined);
    const stageChanges = vi.fn();

    const result = await runConvergenceLoop({
      runReview,
      dispatchFix,
      stageChanges,
      maxRounds: 3,
      convergenceThreshold: 3,
    });

    expect(result.converged).toBe(false);
    expect(result.rounds).toBe(3);
    // Only dispatches fixes for rounds 1 and 2 — no fix on the final round
    expect(dispatchFix).toHaveBeenCalledTimes(2);
  });

  it("stages changes before each re-review", async () => {
    const callOrder: string[] = [];
    const runReview = vi.fn().mockImplementation(async () => {
      callOrder.push("review");
      return makeReviewResult(callOrder.length === 1 ? 5 : 0);
    });
    const dispatchFix = vi.fn().mockImplementation(async () => {
      callOrder.push("fix");
    });
    const stageChanges = vi.fn().mockImplementation(() => {
      callOrder.push("stage");
    });

    await runConvergenceLoop({
      runReview,
      dispatchFix,
      stageChanges,
      maxRounds: 5,
      convergenceThreshold: 3,
    });

    // First: review → findings → fix → stage → review → no findings
    expect(callOrder).toEqual(["review", "fix", "stage", "review"]);
  });

  it("passes findings to dispatchFix", async () => {
    const runReview = vi
      .fn()
      .mockResolvedValueOnce(makeReviewResult(5))
      .mockResolvedValueOnce(makeReviewResult(0));
    const dispatchFix = vi.fn().mockResolvedValue(undefined);
    const stageChanges = vi.fn();

    await runConvergenceLoop({
      runReview,
      dispatchFix,
      stageChanges,
      maxRounds: 5,
      convergenceThreshold: 3,
    });

    const fixCall = dispatchFix.mock.calls[0];
    expect(fixCall[0]).toHaveLength(5);
    expect(fixCall[0][0].id).toBe("f-0");
  });

  it("returns all review results across rounds", async () => {
    const runReview = vi
      .fn()
      .mockResolvedValueOnce(makeReviewResult(4))
      .mockResolvedValueOnce(makeReviewResult(1));
    const dispatchFix = vi.fn().mockResolvedValue(undefined);
    const stageChanges = vi.fn();

    const result = await runConvergenceLoop({
      runReview,
      dispatchFix,
      stageChanges,
      maxRounds: 5,
      convergenceThreshold: 3,
    });

    expect(result.reviewResults).toHaveLength(2);
    expect(result.reviewResults[0].rawFindingCount).toBe(4);
    expect(result.reviewResults[1].rawFindingCount).toBe(1);
  });
});
