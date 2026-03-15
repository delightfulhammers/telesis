import type { CommitResult, PushResult } from "../git/types.js";
import * as gitOps from "../git/operations.js";
import type { CompletionResult, CompletionStep } from "./complete.js";

export interface FinalizeDeps {
  readonly stageFiles: (rootDir: string, files: readonly string[]) => void;
  readonly commit: (rootDir: string, message: string) => CommitResult;
  readonly createTag: (rootDir: string, tag: string) => void;
  readonly push: (rootDir: string, branch: string) => PushResult;
  readonly pushTag: (rootDir: string, tag: string) => void;
  readonly currentBranch: (rootDir: string) => string;
  readonly fileHasChanges: (rootDir: string, filePath: string) => boolean;
  readonly tagExists: (rootDir: string, tag: string) => boolean;
}

export interface FinalizeOptions {
  readonly tag: boolean;
  readonly push: boolean;
}

export interface FinalizeResult {
  readonly steps: readonly CompletionStep[];
  readonly reminders: readonly string[];
}

const DOC_FILES = ["docs/PRD.md", "docs/ARCHITECTURE.md"] as const;

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

export const finalizeMilestone = (
  rootDir: string,
  result: CompletionResult,
  options: FinalizeOptions,
  deps: FinalizeDeps,
): FinalizeResult => {
  const steps: CompletionStep[] = [];
  const reminders: string[] = [];
  const filesToStage = [...result.modifiedFiles];
  const includedDocs: string[] = [];

  for (const docFile of DOC_FILES) {
    if (deps.fileHasChanges(rootDir, docFile)) {
      filesToStage.push(docFile);
      includedDocs.push(docFile);
    } else {
      reminders.push(
        `Update ${docFile} if needed (no uncommitted changes detected)`,
      );
    }
  }

  try {
    deps.stageFiles(rootDir, filesToStage);
    const stageMessage =
      includedDocs.length > 0
        ? `Staged ${filesToStage.length} files (includes ${includedDocs.join(", ")})`
        : `Staged ${filesToStage.length} files`;
    steps.push({ name: "Stage files", passed: true, message: stageMessage });
  } catch (err) {
    steps.push({
      name: "Stage files",
      passed: false,
      message: errorMessage(err),
    });
    return { steps, reminders };
  }

  const commitMessage = `chore: complete milestone ${result.milestone} (v${result.version})`;
  try {
    const commitResult = deps.commit(rootDir, commitMessage);
    steps.push({
      name: "Commit",
      passed: true,
      message: `${commitResult.sha.slice(0, 7)} ${commitMessage}`,
    });
  } catch (err) {
    steps.push({ name: "Commit", passed: false, message: errorMessage(err) });
    return { steps, reminders };
  }

  const tag = `v${result.version}`;
  let tagCreated = false;

  if (options.tag) {
    if (deps.tagExists(rootDir, tag)) {
      steps.push({
        name: "Create tag",
        passed: false,
        message: `Tag ${tag} already exists — delete it first with 'git tag -d ${tag}' or run with --no-tag`,
      });
    } else {
      try {
        deps.createTag(rootDir, tag);
        tagCreated = true;
        steps.push({ name: "Create tag", passed: true, message: tag });
      } catch (err) {
        steps.push({
          name: "Create tag",
          passed: false,
          message: errorMessage(err),
        });
      }
    }
  } else {
    steps.push({
      name: "Create tag",
      passed: true,
      message: "Skipped (--no-tag)",
    });
  }

  if (options.push) {
    try {
      const branch = deps.currentBranch(rootDir);
      const pushResult = deps.push(rootDir, branch);
      steps.push({
        name: "Push branch",
        passed: true,
        message: `${pushResult.remote}/${pushResult.branch}`,
      });
    } catch (err) {
      steps.push({
        name: "Push branch",
        passed: false,
        message: errorMessage(err),
      });
    }

    if (tagCreated) {
      try {
        deps.pushTag(rootDir, tag);
        steps.push({ name: "Push tag", passed: true, message: tag });
      } catch (err) {
        steps.push({
          name: "Push tag",
          passed: false,
          message: errorMessage(err),
        });
      }
    } else {
      steps.push({
        name: "Push tag",
        passed: true,
        message: "Skipped (no tag to push)",
      });
    }
  } else {
    steps.push({
      name: "Push branch",
      passed: true,
      message: "Skipped (--no-push)",
    });
    steps.push({
      name: "Push tag",
      passed: true,
      message: "Skipped (--no-push)",
    });
  }

  return { steps, reminders };
};

export const defaultFinalizeDeps: FinalizeDeps = {
  stageFiles: gitOps.stageFiles,
  commit: gitOps.commit,
  createTag: gitOps.createTag,
  push: gitOps.push,
  pushTag: gitOps.pushTag,
  currentBranch: gitOps.currentBranch,
  fileHasChanges: gitOps.fileHasChanges,
  tagExists: gitOps.tagExists,
};
