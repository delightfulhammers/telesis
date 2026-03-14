import { describe, it, expect } from "vitest";
import { formatRunResult } from "./format.js";
import type { RunResult } from "./types.js";

describe("formatRunResult", () => {
  it("formats completed result with commit, push, and PR", () => {
    const result: RunResult = {
      workItemId: "wi-12345678-abcd-1234-5678-abcdef012345",
      planId: "plan-1234-abcd",
      stage: "completed",
      commitResult: {
        sha: "abc123def456abc123def456abc123def456abc1",
        branch: "telesis/wi-12345-add-auth",
        message: "feat: Add auth (#42)",
        filesChanged: 5,
      },
      pushResult: {
        branch: "telesis/wi-12345-add-auth",
        remote: "origin",
      },
      prUrl: "https://github.com/owner/repo/pull/99",
      durationMs: 45_000,
    };

    const output = formatRunResult(result);

    expect(output).toContain("Pipeline completed");
    expect(output).toContain("wi-12345");
    expect(output).toContain("45s");
    expect(output).toContain("abc123de");
    expect(output).toContain("5 files");
    expect(output).toContain("origin");
    expect(output).toContain("https://github.com/owner/repo/pull/99");
  });

  it("formats completed result without push or PR", () => {
    const result: RunResult = {
      workItemId: "wi-12345678-abcd-1234-5678-abcdef012345",
      planId: "plan-1234-abcd",
      stage: "completed",
      commitResult: {
        sha: "abc123def456abc123def456abc123def456abc1",
        branch: "main",
        message: "feat: Fix bug",
        filesChanged: 2,
      },
      durationMs: 10_000,
    };

    const output = formatRunResult(result);

    expect(output).toContain("Pipeline completed");
    expect(output).toContain("2 files");
    expect(output).not.toContain("Pushed");
    expect(output).not.toContain("PR:");
  });

  it("formats completed result without any git changes", () => {
    const result: RunResult = {
      workItemId: "wi-12345678-abcd-1234-5678-abcdef012345",
      planId: "plan-1234-abcd",
      stage: "completed",
      durationMs: 5_000,
    };

    const output = formatRunResult(result);

    expect(output).toContain("Pipeline completed");
    expect(output).not.toContain("Commit:");
  });

  it("formats failed result with error", () => {
    const result: RunResult = {
      workItemId: "wi-12345678-abcd-1234-5678-abcdef012345",
      planId: "plan-1234-abcd",
      stage: "failed",
      error: "Plan execution failed: 2/5 tasks completed",
      durationMs: 30_000,
    };

    const output = formatRunResult(result);

    expect(output).toContain("Pipeline failed");
    expect(output).toContain("2/5 tasks completed");
  });

  it("formats awaiting_gate result", () => {
    const result: RunResult = {
      workItemId: "wi-12345678-abcd-1234-5678-abcdef012345",
      planId: "plan-12345678-abcd",
      stage: "awaiting_gate",
      durationMs: 20_000,
    };

    const output = formatRunResult(result);

    expect(output).toContain("milestone gate");
    expect(output).toContain("gate-approve");
    expect(output).toContain("plan-123");
  });
});
