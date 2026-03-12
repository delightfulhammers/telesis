import { describe, it, expect } from "vitest";
import { inferReasonFromText, extractDismissalSignals } from "./dismissals.js";
import type { GitHubReviewComment } from "./client.js";

const makeComment = (
  overrides: Partial<GitHubReviewComment> = {},
): GitHubReviewComment => ({
  id: 1,
  body: "some comment",
  path: "src/foo.ts",
  position: 10,
  line: 10,
  ...overrides,
});

describe("inferReasonFromText", () => {
  it("detects [false-positive]", () => {
    expect(inferReasonFromText("This is a [false-positive]")).toBe(
      "false-positive",
    );
  });

  it("detects [fp] shorthand", () => {
    expect(inferReasonFromText("[fp] this is fine")).toBe("false-positive");
  });

  it("detects [not-actionable]", () => {
    expect(inferReasonFromText("Marked as [not-actionable]")).toBe(
      "not-actionable",
    );
  });

  it("detects [na] shorthand", () => {
    expect(inferReasonFromText("[na]")).toBe("not-actionable");
  });

  it("detects [style]", () => {
    expect(inferReasonFromText("Just [style] preference")).toBe(
      "style-preference",
    );
  });

  it("detects [style-preference]", () => {
    expect(inferReasonFromText("[style-preference]")).toBe("style-preference");
  });

  it("detects [already-addressed]", () => {
    expect(inferReasonFromText("[already-addressed] in latest commit")).toBe(
      "already-addressed",
    );
  });

  it("defaults to already-addressed", () => {
    expect(inferReasonFromText("Fixed in latest commit")).toBe(
      "already-addressed",
    );
  });

  it("is case insensitive", () => {
    expect(inferReasonFromText("[FALSE-POSITIVE]")).toBe("false-positive");
    expect(inferReasonFromText("[FP]")).toBe("false-positive");
  });
});

describe("extractDismissalSignals", () => {
  it("returns empty for comments without markers", () => {
    const comments = [makeComment({ body: "looks good" })];
    expect(extractDismissalSignals(comments, 42)).toEqual([]);
  });

  it("returns empty for marker comments with no replies", () => {
    const comments = [
      makeComment({
        id: 1,
        body: "<!-- telesis:finding:abc-123 -->\n**[high]** bug",
      }),
    ];
    expect(extractDismissalSignals(comments, 42)).toEqual([]);
  });

  it("extracts dismissal from replied-to marker comment", () => {
    const comments = [
      makeComment({
        id: 1,
        body: "<!-- telesis:finding:abc-123 -->\n**[high]** bug\n\nSome issue",
        path: "src/foo.ts",
      }),
      makeComment({
        id: 2,
        body: "[fp] this is intentional",
        in_reply_to_id: 1,
        path: "src/foo.ts",
      }),
    ];

    const signals = extractDismissalSignals(comments, 42);
    expect(signals).toHaveLength(1);
    expect(signals[0].findingId).toBe("abc-123");
    expect(signals[0].reason).toBe("false-positive");
    expect(signals[0].path).toBe("src/foo.ts");
    expect(signals[0].platformRef).toContain("github:PR#42");
    expect(signals[0].description).not.toContain("<!-- telesis:finding:");
    expect(signals[0].description).toBe("**[high]** bug\n\nSome issue");
  });

  it("uses last reply for reason inference", () => {
    const comments = [
      makeComment({
        id: 1,
        body: "<!-- telesis:finding:abc-123 -->\n**[high]** bug",
      }),
      makeComment({
        id: 2,
        body: "investigating...",
        in_reply_to_id: 1,
      }),
      makeComment({
        id: 3,
        body: "[na] not relevant to this PR",
        in_reply_to_id: 1,
      }),
    ];

    const signals = extractDismissalSignals(comments, 10);
    expect(signals).toHaveLength(1);
    expect(signals[0].reason).toBe("not-actionable");
  });

  it("handles multiple threads independently", () => {
    const comments = [
      makeComment({
        id: 1,
        body: "<!-- telesis:finding:f1 -->\nIssue 1",
        path: "src/a.ts",
      }),
      makeComment({
        id: 2,
        body: "[fp]",
        in_reply_to_id: 1,
      }),
      makeComment({
        id: 3,
        body: "<!-- telesis:finding:f2 -->\nIssue 2",
        path: "src/b.ts",
      }),
      makeComment({
        id: 4,
        body: "[style] preference only",
        in_reply_to_id: 3,
      }),
    ];

    const signals = extractDismissalSignals(comments, 5);
    expect(signals).toHaveLength(2);
    expect(signals[0].findingId).toBe("f1");
    expect(signals[0].reason).toBe("false-positive");
    expect(signals[1].findingId).toBe("f2");
    expect(signals[1].reason).toBe("style-preference");
  });

  it("handles root comments with in_reply_to_id: null (GitHub API format)", () => {
    const comments = [
      makeComment({
        id: 1,
        body: "<!-- telesis:finding:abc-null -->\n**[high]** bug",
        in_reply_to_id: null,
        path: "src/foo.ts",
      }),
      makeComment({
        id: 2,
        body: "[fp] not a real issue",
        in_reply_to_id: 1,
      }),
    ];

    const signals = extractDismissalSignals(comments, 42);
    expect(signals).toHaveLength(1);
    expect(signals[0].findingId).toBe("abc-null");
    expect(signals[0].reason).toBe("false-positive");
  });

  it("ignores threads where marker is in a reply (not root)", () => {
    const comments = [
      makeComment({ id: 1, body: "Normal comment" }),
      makeComment({
        id: 2,
        body: "<!-- telesis:finding:abc -->\nPasted marker in reply",
        in_reply_to_id: 1,
      }),
    ];

    // The marker is in a reply to thread 1, so thread 1's root doesn't have a marker.
    // The reply (id:2) goes into thread 1 (in_reply_to_id=1), and the root (id:1) has no marker.
    const signals = extractDismissalSignals(comments, 42);
    expect(signals).toHaveLength(0);
  });
});
