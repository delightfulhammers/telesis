import { describe, it, expect } from "vitest";
import {
  inferReasonFromText,
  extractDismissalSignals,
  parseCommentFinding,
  formatDismissalReply,
} from "./dismissals.js";
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
        body: "<!-- telesis:finding:a0000000-0000-0000-0000-000000000001 -->\n**[high]** bug",
      }),
    ];
    expect(extractDismissalSignals(comments, 42)).toEqual([]);
  });

  it("extracts dismissal from replied-to marker comment", () => {
    const comments = [
      makeComment({
        id: 1,
        body: "<!-- telesis:finding:a0000000-0000-0000-0000-000000000001 -->\n**[high]** bug\n\nSome issue",
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
    expect(signals[0].findingId).toBe("a0000000-0000-0000-0000-000000000001");
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
        body: "<!-- telesis:finding:a0000000-0000-0000-0000-000000000001 -->\n**[high]** bug",
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
        body: "<!-- telesis:finding:f0000000-0000-0000-0000-000000000001 -->\nIssue 1",
        path: "src/a.ts",
      }),
      makeComment({
        id: 2,
        body: "[fp]",
        in_reply_to_id: 1,
      }),
      makeComment({
        id: 3,
        body: "<!-- telesis:finding:f0000000-0000-0000-0000-000000000002 -->\nIssue 2",
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
    expect(signals[0].findingId).toBe("f0000000-0000-0000-0000-000000000001");
    expect(signals[0].reason).toBe("false-positive");
    expect(signals[1].findingId).toBe("f0000000-0000-0000-0000-000000000002");
    expect(signals[1].reason).toBe("style-preference");
  });

  it("handles root comments with in_reply_to_id: null (GitHub API format)", () => {
    const comments = [
      makeComment({
        id: 1,
        body: "<!-- telesis:finding:a0000000-0000-0000-0000-000000000099 -->\n**[high]** bug",
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
    expect(signals[0].findingId).toBe("a0000000-0000-0000-0000-000000000099");
    expect(signals[0].reason).toBe("false-positive");
  });

  it("strips marker from description in signals", () => {
    const comments = [
      makeComment({
        id: 1,
        body: "<!-- telesis:finding:f0000000-0000-0000-0000-000000000001 -->\n**[high]** bug\n\nDescription here",
        path: "src/foo.ts",
      }),
      makeComment({
        id: 2,
        body: "[fp]",
        in_reply_to_id: 1,
      }),
    ];

    const signals = extractDismissalSignals(comments, 1);
    expect(signals[0].description).not.toContain("<!-- telesis");
  });

  it("ignores threads where marker is in a reply (not root)", () => {
    const comments = [
      makeComment({ id: 1, body: "Normal comment" }),
      makeComment({
        id: 2,
        body: "<!-- telesis:finding:a0000000-0000-0000-0000-00000000000a -->\nPasted marker in reply",
        in_reply_to_id: 1,
      }),
    ];

    // The marker is in a reply to thread 1, so thread 1's root doesn't have a marker.
    // The reply (id:2) goes into thread 1 (in_reply_to_id=1), and the root (id:1) has no marker.
    const signals = extractDismissalSignals(comments, 42);
    expect(signals).toHaveLength(0);
  });
});

describe("parseCommentFinding", () => {
  it("parses a full finding comment", () => {
    const body = [
      "<!-- telesis:finding:a0000000-0000-0000-0000-000000000001 -->",
      "**[high]** bug",
      "",
      "Some description here",
      "",
      "> **Suggestion:** Fix the thing",
      "",
      "_— correctness persona_",
    ].join("\n");

    const result = parseCommentFinding(body, "src/foo.ts");
    expect(result).not.toBeNull();
    expect(result!.findingId).toBe("a0000000-0000-0000-0000-000000000001");
    expect(result!.severity).toBe("high");
    expect(result!.category).toBe("bug");
    expect(result!.description).toBe("Some description here");
    expect(result!.suggestion).toBe("Fix the thing");
    expect(result!.persona).toBe("correctness");
    expect(result!.path).toBe("src/foo.ts");
  });

  it("parses a finding without suggestion or persona", () => {
    const body = [
      "<!-- telesis:finding:d0000000-0000-0000-0000-000000000456 -->",
      "**[medium]** security",
      "",
      "Missing input validation",
    ].join("\n");

    const result = parseCommentFinding(body, "src/bar.ts");
    expect(result).not.toBeNull();
    expect(result!.findingId).toBe("d0000000-0000-0000-0000-000000000456");
    expect(result!.severity).toBe("medium");
    expect(result!.category).toBe("security");
    expect(result!.description).toBe("Missing input validation");
    expect(result!.suggestion).toBe("");
    expect(result!.persona).toBeUndefined();
  });

  it("returns null for non-marker comment", () => {
    expect(parseCommentFinding("just a comment", "src/foo.ts")).toBeNull();
  });

  it("returns null for marker without severity/category line", () => {
    const body =
      "<!-- telesis:finding:a0000000-0000-0000-0000-00000000000a -->\nJust text, no severity line";
    expect(parseCommentFinding(body, "src/foo.ts")).toBeNull();
  });

  it("defaults unknown severity to medium", () => {
    const body =
      "<!-- telesis:finding:a0000000-0000-0000-0000-00000000000a -->\n**[extreme]** bug\n\nDesc";
    const result = parseCommentFinding(body, "src/foo.ts");
    expect(result!.severity).toBe("medium");
  });

  it("defaults unknown category to bug", () => {
    const body =
      "<!-- telesis:finding:a0000000-0000-0000-0000-00000000000a -->\n**[high]** unknown\n\nDesc";
    const result = parseCommentFinding(body, "src/foo.ts");
    expect(result!.category).toBe("bug");
  });
});

describe("formatDismissalReply", () => {
  it("formats false-positive with shorthand tag", () => {
    expect(formatDismissalReply("false-positive")).toBe("[fp]");
  });

  it("formats not-actionable with shorthand tag", () => {
    expect(formatDismissalReply("not-actionable")).toBe("[na]");
  });

  it("formats style-preference with shorthand tag", () => {
    expect(formatDismissalReply("style-preference")).toBe("[style]");
  });

  it("formats already-addressed with full tag", () => {
    expect(formatDismissalReply("already-addressed")).toBe(
      "[already-addressed]",
    );
  });

  it("appends note when provided", () => {
    expect(formatDismissalReply("false-positive", "Not a real issue")).toBe(
      "[fp] Not a real issue",
    );
  });

  it("omits note when undefined", () => {
    expect(formatDismissalReply("not-actionable", undefined)).toBe("[na]");
  });

  it("round-trips through inferReasonFromText", () => {
    const reasons = [
      "false-positive",
      "not-actionable",
      "style-preference",
      "already-addressed",
    ] as const;
    for (const reason of reasons) {
      const reply = formatDismissalReply(reason, "some note");
      expect(inferReasonFromText(reply)).toBe(reason);
    }
  });
});
