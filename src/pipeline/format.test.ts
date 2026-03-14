import { describe, it, expect } from "vitest";
import { formatRunResult } from "./format.js";
import type { RunResult, ReviewSummary } from "./types.js";

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

  it("formats completed result with passing review summary", () => {
    const reviewSummary: ReviewSummary = {
      ran: true,
      passed: true,
      totalFindings: 3,
      blockingFindings: 0,
      threshold: "high",
      findings: [],
    };
    const result: RunResult = {
      workItemId: "wi-12345678-abcd-1234-5678-abcdef012345",
      planId: "plan-1234-abcd",
      stage: "completed",
      commitResult: {
        sha: "abc123def456abc123def456abc123def456abc1",
        branch: "main",
        message: "feat: something",
        filesChanged: 1,
      },
      reviewSummary,
      durationMs: 20_000,
    };

    const output = formatRunResult(result);

    expect(output).toContain("Review: passed");
    expect(output).toContain("3 findings");
    expect(output).toContain("0 blocking");
    expect(output).toContain("threshold: high");
  });

  it("formats failed result with blocking review summary", () => {
    const reviewSummary: ReviewSummary = {
      ran: true,
      passed: false,
      totalFindings: 5,
      blockingFindings: 2,
      threshold: "medium",
      findings: [],
    };
    const result: RunResult = {
      workItemId: "wi-12345678-abcd-1234-5678-abcdef012345",
      planId: "plan-1234-abcd",
      stage: "failed",
      error: "Review blocked pipeline",
      reviewSummary,
      durationMs: 15_000,
    };

    const output = formatRunResult(result);

    expect(output).toContain("Pipeline failed");
    expect(output).toContain("5 findings");
    expect(output).toContain("2 blocking");
    expect(output).toContain("threshold: medium");
  });

  it("omits review line when reviewSummary is absent", () => {
    const result: RunResult = {
      workItemId: "wi-12345678-abcd-1234-5678-abcdef012345",
      planId: "plan-1234-abcd",
      stage: "completed",
      durationMs: 5_000,
    };

    const output = formatRunResult(result);

    expect(output).not.toContain("Review:");
  });

  it("formats review_failed result with review summary", () => {
    const reviewSummary: ReviewSummary = {
      ran: true,
      passed: false,
      totalFindings: 5,
      blockingFindings: 2,
      threshold: "high",
      findings: [],
    };
    const result: RunResult = {
      workItemId: "wi-12345678-abcd-1234-5678-abcdef012345",
      planId: "plan-1234-abcd",
      stage: "review_failed",
      commitResult: {
        sha: "abc123def456abc123def456abc123def456abc1",
        branch: "main",
        message: "feat: something",
        filesChanged: 3,
      },
      reviewSummary,
      durationMs: 25_000,
    };

    const output = formatRunResult(result);

    expect(output).toContain("Pipeline blocked by review");
    expect(output).toContain("5 findings");
    expect(output).toContain("2 blocking");
    expect(output).toContain("threshold: high");
    expect(output).toContain("abc123de");
    expect(output).toContain("3 files");
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
