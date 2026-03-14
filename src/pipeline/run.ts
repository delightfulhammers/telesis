import { loadWorkItem, updateWorkItem } from "../intake/store.js";
import { createPlanFromWorkItem } from "../plan/create.js";
import { loadPlan, updatePlan } from "../plan/store.js";
import { formatPlanDetail } from "../plan/format.js";
import { executePlan } from "../plan/executor.js";
import type { ExecutorDeps } from "../plan/executor.js";
import {
  hasChanges,
  createBranch,
  stageAll,
  commit,
  amendCommit,
  softReset,
  resolveRef,
  push,
  currentBranch,
  remoteBranchExists,
} from "../git/operations.js";
import { runQualityGates, defaultExecCommand } from "./quality-gates.js";
import {
  generateCommitMessage,
  generateLLMCommitMessage,
} from "../git/commit-message.js";
import { createPullRequest, closeIssue } from "../github/pr.js";
import { generatePRBody, generateLLMPRBody } from "../github/pr-body.js";
import { extractRepoContext } from "../github/environment.js";
import { randomUUID } from "node:crypto";
import { createEvent } from "../daemon/types.js";
import { resolveDiff } from "../agent/review/diff.js";
import { assembleReviewContext } from "../agent/review/context.js";
import { reviewDiff } from "../agent/review/agent.js";
import { SEVERITIES } from "../agent/review/types.js";
import type { ReviewBlockThreshold } from "../config/config.js";
import type { ReviewFinding } from "../agent/review/types.js";
import {
  isPastStage,
  type RunDeps,
  type RunResult,
  type RunStage,
  type RunOptions,
  type ReviewSummary,
  type PipelineState,
} from "./types.js";
import { savePipelineState, removePipelineState } from "./state.js";

/** Mutable partial state for accumulation during pipeline execution */
type MutablePartialState = {
  -readonly [K in keyof PipelineState]?: PipelineState[K];
};

const DEFAULT_BRANCH_PREFIX = "telesis/";

/** Slugify a title for use in branch names */
const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

/** Check whether a finding's severity meets or exceeds the blocking threshold */
const isBlocking = (
  severity: string,
  threshold: ReviewBlockThreshold,
): boolean => {
  const severityIndex = SEVERITIES.indexOf(
    severity as (typeof SEVERITIES)[number],
  );
  const thresholdIndex = SEVERITIES.indexOf(threshold);
  if (thresholdIndex < 0) {
    throw new TypeError(`Unknown threshold: ${threshold}`);
  }
  return severityIndex >= 0 && severityIndex <= thresholdIndex;
};

/** Filter findings to those at or above the blocking threshold */
export const filterBlockingFindings = (
  findings: readonly ReviewFinding[],
  threshold: ReviewBlockThreshold,
): readonly ReviewFinding[] =>
  findings.filter((f) => isBlocking(f.severity, threshold));

const DEFAULT_REVIEW_MODEL = "claude-sonnet-4-6";

/** Build a PipelineState snapshot with accumulated values */
const buildState = (
  base: Pick<PipelineState, "workItemId" | "planId" | "startedAt">,
  currentStage: RunStage,
  accumulated: MutablePartialState = {},
): PipelineState => ({
  ...base,
  ...accumulated,
  currentStage,
  updatedAt: new Date().toISOString(),
});

/** Run the full pipeline for a work item */
export const runPipeline = async (
  deps: RunDeps,
  workItemId: string,
  options?: RunOptions,
): Promise<RunResult> => {
  const startTime = Date.now();
  const resumeState = options?.resumeState;
  const branchOverride = options?.branchOverride;

  const emitStage = (stage: RunStage): void => {
    deps.onEvent?.(
      createEvent("pipeline:stage_changed", {
        workItemId,
        stage,
      }),
    );
  };

  const fail = (planId: string, stage: RunStage, error: string): RunResult => ({
    workItemId,
    planId,
    stage,
    error,
    durationMs: Date.now() - startTime,
  });

  // 1. Load work item
  const workItem = loadWorkItem(deps.rootDir, workItemId);
  if (!workItem) {
    return fail("", "failed", `No work item matching "${workItemId}"`);
  }

  // On fresh runs, validate status; on resume, skip since we already validated
  if (!resumeState) {
    const validStatuses = new Set(["pending", "approved"]);
    if (!validStatuses.has(workItem.status)) {
      return fail(
        "",
        "failed",
        `Work item ${workItem.id.slice(0, 8)} has status "${workItem.status}", expected "pending" or "approved"`,
      );
    }
  }

  // State tracking for persistence
  const stateBase = {
    workItemId: workItem.id,
    planId: resumeState?.planId ?? "",
    startedAt: resumeState?.startedAt ?? new Date().toISOString(),
  };
  let accumulated: MutablePartialState = {};

  // Emit resumed event if resuming
  if (resumeState) {
    deps.onEvent?.(
      createEvent("pipeline:resumed", {
        workItemId: workItem.id,
        resumedFromStage: resumeState.currentStage,
      }),
    );

    // Restore cached values from previous run
    accumulated = {
      preExecutionSha: resumeState.preExecutionSha,
      branch: resumeState.branch,
      commitResult: resumeState.commitResult,
      qualityGateSummary: resumeState.qualityGateSummary,
      reviewSummary: resumeState.reviewSummary,
      pushResult: resumeState.pushResult,
      prUrl: resumeState.prUrl,
    };
  }

  deps.onEvent?.(
    createEvent("pipeline:started", {
      workItemId: workItem.id,
      title: workItem.title,
    }),
  );

  // 2. Create plan (or reload on resume)
  let plan;
  if (resumeState && isPastStage(resumeState.currentStage, "planning")) {
    // Plan already created — reload from store
    plan = loadPlan(deps.rootDir, resumeState.planId);
    if (!plan) {
      return fail(
        resumeState.planId,
        "failed",
        `Could not reload plan ${resumeState.planId.slice(0, 8)} for resume`,
      );
    }

    // Ensure plan is approved when resuming past approval
    if (
      plan.status !== "approved" &&
      plan.status !== "completed" &&
      isPastStage(resumeState.currentStage, "awaiting_approval")
    ) {
      plan = {
        ...plan,
        status: "approved" as const,
        approvedAt: new Date().toISOString(),
      };
      updatePlan(deps.rootDir, plan);
    }
  } else {
    emitStage("planning");
    try {
      plan = await createPlanFromWorkItem(
        deps.modelClient,
        deps.rootDir,
        workItem,
        deps.plannerConfig.model,
        deps.plannerConfig.maxTasks,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      return fail("", "failed", `Plan creation failed: ${msg}`);
    }

    stateBase.planId = plan.id;
    savePipelineState(
      deps.rootDir,
      buildState(stateBase, "awaiting_approval", accumulated),
    );
  }

  // 3. Display plan and prompt for approval
  if (
    !(resumeState && isPastStage(resumeState.currentStage, "awaiting_approval"))
  ) {
    emitStage("awaiting_approval");
    console.log("");
    console.log(formatPlanDetail(plan));
    console.log("");

    const autoApprove = deps.pipelineConfig.autoApprove === true;
    if (!autoApprove) {
      const approved = await deps.confirm(
        `Approve plan ${plan.id.slice(0, 8)}? (y/n)`,
      );
      if (!approved) {
        removePipelineState(deps.rootDir, workItem.id);
        return fail(plan.id, "failed", "Plan rejected by user");
      }
    }

    // 4. Approve plan
    plan = {
      ...plan,
      status: "approved" as const,
      approvedAt: new Date().toISOString(),
    };
    updatePlan(deps.rootDir, plan);

    savePipelineState(
      deps.rootDir,
      buildState(stateBase, "executing", accumulated),
    );
  }

  // 5. Execute plan — capture HEAD before execution so we can squash agent commits
  const shouldReview = deps.pipelineConfig.reviewBeforePush === true;

  if (!(resumeState && isPastStage(resumeState.currentStage, "executing"))) {
    const preExecutionSha = resolveRef(deps.rootDir);
    accumulated.preExecutionSha = preExecutionSha;
    emitStage("executing");

    const executorDeps: ExecutorDeps = {
      rootDir: deps.rootDir,
      adapter: deps.adapter,
      agent: deps.agent,
      onEvent: deps.onEvent,
      maxConcurrent: deps.dispatchConfig.maxConcurrent,
      modelClient: deps.modelClient,
      validationConfig: deps.validationConfig,
    };

    const execResult = await executePlan(executorDeps, plan);

    // 6. Handle gate
    if (execResult.status === "awaiting_gate") {
      emitStage("awaiting_gate");

      const gateApproved = await deps.confirm(
        `Plan ${plan.id.slice(0, 8)} hit a milestone gate. Approve? (y/n)`,
      );
      if (!gateApproved) {
        return fail(plan.id, "awaiting_gate", "Gate approval pending");
      }

      plan = {
        ...plan,
        status: "completed" as const,
        completedAt: new Date().toISOString(),
      };
      updatePlan(deps.rootDir, plan);
    }

    // 7. Handle failure/escalation
    if (execResult.status === "failed" || execResult.status === "escalated") {
      deps.onEvent?.(
        createEvent("pipeline:failed", {
          workItemId: workItem.id,
          title: workItem.title,
        }),
      );
      savePipelineState(
        deps.rootDir,
        buildState(stateBase, "executing", accumulated),
      );
      return fail(
        plan.id,
        "failed",
        `Plan execution ${execResult.status}: ${execResult.completedTasks}/${execResult.totalTasks} tasks completed`,
      );
    }

    // 8. Squash any agent commits back to staged changes so we get one pipeline commit
    try {
      softReset(deps.rootDir, preExecutionSha);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      deps.onEvent?.(
        createEvent("pipeline:failed", {
          workItemId: workItem.id,
          title: workItem.title,
        }),
      );
      return fail(plan.id, "failed", `Failed to squash agent commits: ${msg}`);
    }

    // 9. Check for changes
    if (!hasChanges(deps.rootDir)) {
      removePipelineState(deps.rootDir, workItem.id);
      deps.onEvent?.(
        createEvent("pipeline:completed", {
          workItemId: workItem.id,
          title: workItem.title,
        }),
      );

      updateWorkItem(deps.rootDir, {
        ...workItem,
        status: "completed",
        completedAt: new Date().toISOString(),
      });

      return {
        workItemId: workItem.id,
        planId: plan.id,
        stage: "completed",
        durationMs: Date.now() - startTime,
      };
    }

    savePipelineState(
      deps.rootDir,
      buildState(stateBase, "committing", accumulated),
    );
  }

  // 9. Create branch (unless commitToMain) + commit
  if (!(resumeState && isPastStage(resumeState.currentStage, "committing"))) {
    const commitToMain = deps.gitConfig.commitToMain === true;
    let branch = currentBranch(deps.rootDir);

    if (!commitToMain) {
      const prefix = deps.gitConfig.branchPrefix ?? DEFAULT_BRANCH_PREFIX;
      const slug = slugify(workItem.title);
      const shortId = workItem.id.slice(0, 8);
      branch = branchOverride ?? `${prefix}${shortId}-${slug}`;

      createBranch(deps.rootDir, branch);
    }

    // 10. Stage all + commit
    emitStage("committing");
    stageAll(deps.rootDir);

    let commitMessage: string;
    if (deps.gitConfig.llmCommitMessages && accumulated.preExecutionSha) {
      // No ref arg → --cached → diffs staged changes against HEAD
      const stagedDiff = resolveDiff(deps.rootDir);
      commitMessage = await generateLLMCommitMessage(
        deps.modelClient,
        stagedDiff.diff,
        plan,
        workItem,
      );
    } else {
      commitMessage = generateCommitMessage(plan, workItem);
    }

    const commitResult = commit(deps.rootDir, commitMessage);
    accumulated.branch = branch;
    accumulated.commitResult = commitResult;

    deps.onEvent?.(
      createEvent("git:committed", {
        sha: commitResult.sha,
        branch: commitResult.branch,
        filesChanged: commitResult.filesChanged,
      }),
    );

    // Determine next stage for state save
    const nextStage: RunStage = deps.pipelineConfig.qualityGates
      ? "quality_check"
      : shouldReview
        ? "reviewing"
        : "pushing";
    savePipelineState(
      deps.rootDir,
      buildState(stateBase, nextStage, accumulated),
    );
  }

  // Use accumulated values (from this run or from resume state)
  let commitResult = accumulated.commitResult!;
  let branch = accumulated.branch ?? currentBranch(deps.rootDir);
  const preExecutionSha = accumulated.preExecutionSha;

  // 11. Quality gates (if configured)
  let qualityGateSummary = accumulated.qualityGateSummary;
  if (
    deps.pipelineConfig.qualityGates &&
    !(resumeState && isPastStage(resumeState.currentStage, "quality_check"))
  ) {
    emitStage("quality_check");
    const { summary, amendedCommit } = runQualityGates(
      {
        rootDir: deps.rootDir,
        workItemId: workItem.id,
        onEvent: deps.onEvent,
        hasChanges,
        stageAll,
        amendCommit,
        runDriftChecks: deps.runDriftChecks ?? (() => ({ passed: true })),
        execCommand: deps.execCommand ?? defaultExecCommand,
      },
      deps.pipelineConfig.qualityGates,
    );

    qualityGateSummary = summary;
    accumulated.qualityGateSummary = summary;

    if (amendedCommit) {
      commitResult = amendedCommit;
      accumulated.commitResult = commitResult;
      deps.onEvent?.(
        createEvent("git:committed", {
          sha: commitResult.sha,
          branch: commitResult.branch,
          filesChanged: commitResult.filesChanged,
        }),
      );
    }

    if (!summary.passed) {
      savePipelineState(
        deps.rootDir,
        buildState(stateBase, "quality_check", accumulated),
      );
      return {
        workItemId: workItem.id,
        planId: plan.id,
        stage: "quality_check_failed",
        commitResult,
        qualityGateSummary,
        error: `Quality gate failed: ${summary.results.find((r) => !r.passed)?.gate}`,
        durationMs: Date.now() - startTime,
      };
    }

    const nextStage: RunStage = shouldReview ? "reviewing" : "pushing";
    savePipelineState(
      deps.rootDir,
      buildState(stateBase, nextStage, accumulated),
    );
  }

  // 12. Review (if configured)
  let reviewSummary: ReviewSummary | undefined = accumulated.reviewSummary;

  if (
    shouldReview &&
    !(resumeState && isPastStage(resumeState.currentStage, "reviewing"))
  ) {
    emitStage("reviewing");
    const threshold = deps.pipelineConfig.reviewBlockThreshold ?? "high";

    try {
      if (!preExecutionSha) {
        throw new Error(
          "preExecutionSha is required for review diff — pipeline state may be corrupt",
        );
      }
      const diffRef = `${preExecutionSha}..HEAD`;
      const resolved = resolveDiff(deps.rootDir, diffRef);
      const context = assembleReviewContext(deps.rootDir);
      const reviewModel =
        deps.pipelineConfig.reviewModel ?? DEFAULT_REVIEW_MODEL;
      const sessionId = randomUUID();

      const reviewResult = await reviewDiff(
        deps.modelClient,
        resolved.diff,
        resolved.files,
        context,
        sessionId,
        reviewModel,
      );

      const blocking = filterBlockingFindings(reviewResult.findings, threshold);

      reviewSummary = {
        ran: true,
        passed: blocking.length === 0,
        totalFindings: reviewResult.findings.length,
        blockingFindings: blocking.length,
        threshold,
        findings: reviewResult.findings,
      };
      accumulated.reviewSummary = reviewSummary;

      if (blocking.length > 0) {
        deps.onEvent?.(
          createEvent("pipeline:review_failed", {
            workItemId: workItem.id,
            findingCount: reviewResult.findings.length,
            blockingCount: blocking.length,
            threshold,
          }),
        );

        savePipelineState(
          deps.rootDir,
          buildState(stateBase, "reviewing", accumulated),
        );

        return {
          workItemId: workItem.id,
          planId: plan.id,
          stage: "review_failed",
          commitResult,
          reviewSummary,
          durationMs: Date.now() - startTime,
        };
      }

      deps.onEvent?.(
        createEvent("pipeline:review_passed", {
          workItemId: workItem.id,
          findingCount: reviewResult.findings.length,
          blockingCount: 0,
          threshold,
        }),
      );
    } catch (err) {
      // Review tooling failure should not block the pipeline
      const msg = err instanceof Error ? err.message : "unknown error";
      console.error(`Review stage error (non-blocking): ${msg}`);

      reviewSummary = {
        ran: false,
        passed: true,
        totalFindings: 0,
        blockingFindings: 0,
        threshold,
        findings: [],
      };
      accumulated.reviewSummary = reviewSummary;

      deps.onEvent?.(
        createEvent("pipeline:review_passed", {
          workItemId: workItem.id,
          findingCount: 0,
          blockingCount: 0,
          threshold,
        }),
      );
    }

    savePipelineState(
      deps.rootDir,
      buildState(stateBase, "pushing", accumulated),
    );
  }

  // 12. Push (if configured)
  const commitToMain = deps.gitConfig.commitToMain === true;
  let pushResult = accumulated.pushResult;
  const shouldPush = deps.gitConfig.pushAfterCommit !== false;
  if (
    shouldPush &&
    !(resumeState && isPastStage(resumeState.currentStage, "pushing"))
  ) {
    emitStage("pushing");
    const needsUpstream =
      !commitToMain && !remoteBranchExists(deps.rootDir, branch);
    pushResult = push(deps.rootDir, branch, needsUpstream);
    accumulated.pushResult = pushResult;

    deps.onEvent?.(
      createEvent("git:pushed", {
        branch: pushResult.branch,
        remote: pushResult.remote,
      }),
    );

    savePipelineState(
      deps.rootDir,
      buildState(stateBase, "creating_pr", accumulated),
    );
  }

  // 13. Create PR (if configured and on a branch)
  let prUrl: string | undefined = accumulated.prUrl;
  if (
    deps.gitConfig.createPR === true &&
    !commitToMain &&
    !(resumeState && isPastStage(resumeState.currentStage, "creating_pr"))
  ) {
    emitStage("creating_pr");

    const token = process.env.GITHUB_TOKEN;
    const repoCtx = extractRepoContext();

    if (token && repoCtx) {
      const partialResult: RunResult = {
        workItemId: workItem.id,
        planId: plan.id,
        stage: "creating_pr",
        commitResult,
        qualityGateSummary,
        reviewSummary,
        durationMs: Date.now() - startTime,
      };

      let prBody: string;
      if (deps.gitConfig.llmPRBody && preExecutionSha) {
        const prDiff = resolveDiff(deps.rootDir, `${preExecutionSha}..HEAD`);
        prBody = await generateLLMPRBody(
          deps.modelClient,
          prDiff.diff,
          plan,
          workItem,
          partialResult,
        );
      } else {
        prBody = generatePRBody(plan, workItem, partialResult);
      }

      const prResult = await createPullRequest({
        owner: repoCtx.owner,
        repo: repoCtx.repo,
        token,
        title: workItem.title,
        body: prBody,
        head: branch,
        base: "main",
      });

      prUrl = prResult.url;
      accumulated.prUrl = prUrl;

      deps.onEvent?.(
        createEvent("github:pr_created", {
          prNumber: prResult.number,
          url: prResult.url,
          branch,
        }),
      );
    }

    savePipelineState(
      deps.rootDir,
      buildState(stateBase, "closing_issue", accumulated),
    );
  }

  // 14. Close issue (if configured and source is GitHub)
  if (deps.pipelineConfig.closeIssue === true && workItem.source === "github") {
    emitStage("closing_issue");

    const token = process.env.GITHUB_TOKEN;
    const repoCtx = extractRepoContext();
    const issueNumber = parseInt(workItem.sourceId, 10);

    if (token && repoCtx && !isNaN(issueNumber)) {
      await closeIssue(repoCtx.owner, repoCtx.repo, token, issueNumber);

      deps.onEvent?.(
        createEvent("github:issue_closed", {
          issueNumber,
          owner: repoCtx.owner,
          repo: repoCtx.repo,
        }),
      );
    }
  }

  // 15. Cleanup state + update work item status
  removePipelineState(deps.rootDir, workItem.id);

  updateWorkItem(deps.rootDir, {
    ...workItem,
    status: "completed",
    completedAt: new Date().toISOString(),
  });

  deps.onEvent?.(
    createEvent("pipeline:completed", {
      workItemId: workItem.id,
      title: workItem.title,
    }),
  );

  return {
    workItemId: workItem.id,
    planId: plan.id,
    stage: "completed",
    commitResult,
    pushResult,
    prUrl,
    reviewSummary,
    qualityGateSummary,
    resumed: !!resumeState,
    resumedFromStage: resumeState?.currentStage,
    durationMs: Date.now() - startTime,
  };
};
