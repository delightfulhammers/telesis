import { loadWorkItem, updateWorkItem } from "../intake/store.js";
import { createPlanFromWorkItem } from "../plan/create.js";
import { updatePlan } from "../plan/store.js";
import { formatPlanDetail } from "../plan/format.js";
import { executePlan } from "../plan/executor.js";
import type { ExecutorDeps } from "../plan/executor.js";
import {
  hasChanges,
  createBranch,
  stageAll,
  commit,
  push,
  currentBranch,
  remoteBranchExists,
} from "../git/operations.js";
import { generateCommitMessage } from "../git/commit-message.js";
import { createPullRequest, closeIssue } from "../github/pr.js";
import { extractRepoContext } from "../github/environment.js";
import { createEvent } from "../daemon/types.js";
import type { RunDeps, RunResult, RunStage } from "./types.js";

const DEFAULT_BRANCH_PREFIX = "telesis/";

/** Slugify a title for use in branch names */
const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

/** Run the full pipeline for a work item */
export const runPipeline = async (
  deps: RunDeps,
  workItemId: string,
  branchOverride?: string,
): Promise<RunResult> => {
  const startTime = Date.now();

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

  const validStatuses = new Set(["pending", "approved"]);
  if (!validStatuses.has(workItem.status)) {
    return fail(
      "",
      "failed",
      `Work item ${workItem.id.slice(0, 8)} has status "${workItem.status}", expected "pending" or "approved"`,
    );
  }

  deps.onEvent?.(
    createEvent("pipeline:started", {
      workItemId: workItem.id,
      title: workItem.title,
    }),
  );

  // 2. Create plan
  emitStage("planning");
  let plan;
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

  // 3. Display plan and prompt for approval
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

  // 5. Execute plan
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

    // Reload plan after execution updated it, then mark completed
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
    return fail(
      plan.id,
      "failed",
      `Plan execution ${execResult.status}: ${execResult.completedTasks}/${execResult.totalTasks} tasks completed`,
    );
  }

  // 8. Check for changes
  if (!hasChanges(deps.rootDir)) {
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

  // 9. Create branch (unless commitToMain)
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
  const commitMessage = generateCommitMessage(plan, workItem);
  const commitResult = commit(deps.rootDir, commitMessage);

  deps.onEvent?.(
    createEvent("git:committed", {
      sha: commitResult.sha,
      branch: commitResult.branch,
      filesChanged: commitResult.filesChanged,
    }),
  );

  // 11. Push (if configured)
  let pushResult;
  const shouldPush = deps.gitConfig.pushAfterCommit !== false;
  if (shouldPush) {
    emitStage("pushing");
    const needsUpstream =
      !commitToMain && !remoteBranchExists(deps.rootDir, branch);
    pushResult = push(deps.rootDir, branch, needsUpstream);

    deps.onEvent?.(
      createEvent("git:pushed", {
        branch: pushResult.branch,
        remote: pushResult.remote,
      }),
    );
  }

  // 12. Create PR (if configured and on a branch)
  let prUrl: string | undefined;
  if (deps.gitConfig.createPR === true && !commitToMain) {
    emitStage("creating_pr");

    const token = process.env.GITHUB_TOKEN;
    const repoCtx = extractRepoContext();

    if (token && repoCtx) {
      const prResult = await createPullRequest({
        owner: repoCtx.owner,
        repo: repoCtx.repo,
        token,
        title: workItem.title,
        body: [
          `Resolves #${workItem.sourceId}`,
          "",
          `Plan: ${plan.title}`,
          `Tasks: ${plan.tasks.length}`,
          `Work item: ${workItem.id.slice(0, 8)}`,
        ].join("\n"),
        head: branch,
        base: "main",
      });

      prUrl = prResult.url;

      deps.onEvent?.(
        createEvent("github:pr_created", {
          prNumber: prResult.number,
          url: prResult.url,
          branch,
        }),
      );
    }
  }

  // 13. Close issue (if configured and source is GitHub)
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

  // 14. Update work item status
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
    durationMs: Date.now() - startTime,
  };
};
