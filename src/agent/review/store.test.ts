import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  saveReviewSession,
  loadReviewSession,
  listReviewSessions,
} from "./store.js";
import type { ReviewSession, ReviewFinding } from "./types.js";
import { useTempDir } from "../../test-utils.js";

const makeTempDir = useTempDir("review-store-test");

const makeSession = (
  overrides: Partial<ReviewSession> = {},
): ReviewSession => ({
  id: "session-1",
  timestamp: "2026-03-10T12:00:00Z",
  ref: "staged changes",
  files: [{ path: "src/foo.ts", status: "modified" }],
  findingCount: 1,
  model: "claude-sonnet-4-6",
  durationMs: 500,
  tokenUsage: { inputTokens: 100, outputTokens: 50 },
  ...overrides,
});

const makeFinding = (
  overrides: Partial<ReviewFinding> = {},
): ReviewFinding => ({
  id: "finding-1",
  sessionId: "session-1",
  severity: "high",
  category: "bug",
  path: "src/foo.ts",
  startLine: 10,
  endLine: 15,
  description: "Null check missing",
  suggestion: "Add null check",
  ...overrides,
});

describe("saveReviewSession", () => {
  it("creates reviews directory and writes JSONL", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".telesis"), { recursive: true });

    const session = makeSession();
    const findings = [makeFinding()];

    saveReviewSession(dir, session, findings);

    const content = readFileSync(
      join(dir, ".telesis", "reviews", "session-1.jsonl"),
      "utf-8",
    );
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);

    const sessionRecord = JSON.parse(lines[0]);
    expect(sessionRecord.type).toBe("session");
    expect(sessionRecord.data.id).toBe("session-1");

    const findingRecord = JSON.parse(lines[1]);
    expect(findingRecord.type).toBe("finding");
    expect(findingRecord.data.description).toBe("Null check missing");
  });

  it("writes session with no findings", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".telesis"), { recursive: true });

    saveReviewSession(dir, makeSession({ findingCount: 0 }), []);

    const content = readFileSync(
      join(dir, ".telesis", "reviews", "session-1.jsonl"),
      "utf-8",
    );
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(1);
  });
});

describe("loadReviewSession", () => {
  it("round-trips session and findings", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".telesis"), { recursive: true });

    const session = makeSession();
    const findings = [
      makeFinding({ id: "f1", description: "Issue A" }),
      makeFinding({ id: "f2", description: "Issue B" }),
    ];

    saveReviewSession(dir, session, findings);
    const loaded = loadReviewSession(dir, "session-1");

    expect(loaded.session.id).toBe("session-1");
    expect(loaded.findings).toHaveLength(2);
    expect(loaded.findings[0].description).toBe("Issue A");
    expect(loaded.findings[1].description).toBe("Issue B");
  });

  it("throws on missing session file", () => {
    const dir = makeTempDir();
    expect(() => loadReviewSession(dir, "nonexistent")).toThrow();
  });

  it("throws on file without session record", () => {
    const dir = makeTempDir();
    const reviewsDir = join(dir, ".telesis", "reviews");
    mkdirSync(reviewsDir, { recursive: true });
    writeFileSync(
      join(reviewsDir, "bad.jsonl"),
      JSON.stringify({ type: "finding", data: makeFinding() }) + "\n",
    );

    expect(() => loadReviewSession(dir, "bad")).toThrow(
      "invalid review session",
    );
  });

  it("skips malformed lines", () => {
    const dir = makeTempDir();
    const reviewsDir = join(dir, ".telesis", "reviews");
    mkdirSync(reviewsDir, { recursive: true });

    const lines = [
      JSON.stringify({ type: "session", data: makeSession() }),
      "this is not json",
      JSON.stringify({ type: "finding", data: makeFinding() }),
    ];
    writeFileSync(join(reviewsDir, "session-1.jsonl"), lines.join("\n") + "\n");

    const loaded = loadReviewSession(dir, "session-1");
    expect(loaded.session.id).toBe("session-1");
    expect(loaded.findings).toHaveLength(1);
  });
});

describe("listReviewSessions", () => {
  it("returns empty when no reviews directory", () => {
    const dir = makeTempDir();
    expect(listReviewSessions(dir)).toEqual([]);
  });

  it("lists sessions sorted newest first", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".telesis"), { recursive: true });

    saveReviewSession(
      dir,
      makeSession({ id: "old", timestamp: "2026-03-09T10:00:00Z" }),
      [],
    );
    saveReviewSession(
      dir,
      makeSession({ id: "new", timestamp: "2026-03-10T10:00:00Z" }),
      [],
    );

    const sessions = listReviewSessions(dir);
    expect(sessions).toHaveLength(2);
    expect(sessions[0].id).toBe("new");
    expect(sessions[1].id).toBe("old");
  });

  it("skips non-jsonl files", () => {
    const dir = makeTempDir();
    const reviewsDir = join(dir, ".telesis", "reviews");
    mkdirSync(reviewsDir, { recursive: true });
    writeFileSync(join(reviewsDir, "README.md"), "# Reviews\n");

    saveReviewSession(dir, makeSession(), []);

    const sessions = listReviewSessions(dir);
    expect(sessions).toHaveLength(1);
  });
});
