import type { ReviewResult, ReviewFinding } from "../agent/review/pipeline.js";

export interface ConvergenceLoopDeps {
  /** Runs a review and returns structured results. */
  readonly runReview: () => Promise<ReviewResult>;
  /** Dispatches a coding agent to fix the given findings. */
  readonly dispatchFix: (findings: readonly ReviewFinding[]) => Promise<void>;
  /** Stages all changes (git add) before the next review round. */
  readonly stageChanges: () => void;
  /** Maximum number of review rounds before escalating. */
  readonly maxRounds: number;
  /** Number of findings at or below which we consider the review converged. */
  readonly convergenceThreshold: number;
}

export interface ConvergenceResult {
  readonly converged: boolean;
  readonly rounds: number;
  readonly finalFindings: readonly ReviewFinding[];
  readonly reviewResults: readonly ReviewResult[];
}

/**
 * Runs the automated review-fix-review convergence loop.
 *
 * 1. Run review
 * 2. If findings ≤ threshold → converged
 * 3. Dispatch fix task for findings
 * 4. Stage changes
 * 5. Go to 1
 * 6. After maxRounds without convergence → not converged (escalate)
 */
export const runConvergenceLoop = async (
  deps: ConvergenceLoopDeps,
): Promise<ConvergenceResult> => {
  if (deps.maxRounds < 1) {
    throw new RangeError("maxRounds must be at least 1");
  }

  const reviewResults: ReviewResult[] = [];

  for (let round = 1; round <= deps.maxRounds; round++) {
    const result = await deps.runReview();
    reviewResults.push(result);

    const findingCount = result.findings.length;

    if (findingCount <= deps.convergenceThreshold) {
      return {
        converged: true,
        rounds: round,
        finalFindings: result.findings,
        reviewResults,
      };
    }

    // Dispatch fixes and re-stage for next round (skip on final round)
    if (round < deps.maxRounds) {
      await deps.dispatchFix(result.findings);
      deps.stageChanges();
    }
  }

  const lastResult = reviewResults[reviewResults.length - 1];
  return {
    converged: false,
    rounds: deps.maxRounds,
    finalFindings: lastResult.findings,
    reviewResults,
  };
};
