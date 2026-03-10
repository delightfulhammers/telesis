import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  type Dirent,
} from "node:fs";
import { join } from "node:path";
import type { ReviewSession, ReviewFinding } from "./types.js";

const REVIEWS_DIR = ".telesis/reviews";

const reviewsPath = (rootDir: string): string => join(rootDir, REVIEWS_DIR);

const sessionPath = (rootDir: string, sessionId: string): string =>
  join(reviewsPath(rootDir), `${sessionId}.jsonl`);

export const saveReviewSession = (
  rootDir: string,
  session: ReviewSession,
  findings: readonly ReviewFinding[],
): void => {
  const dir = reviewsPath(rootDir);
  mkdirSync(dir, { recursive: true });

  const path = sessionPath(rootDir, session.id);
  const lines = [
    JSON.stringify({ type: "session", data: session }),
    ...findings.map((f) => JSON.stringify({ type: "finding", data: f })),
  ];
  writeFileSync(path, lines.join("\n") + "\n");
};

interface SessionRecord {
  readonly type: "session";
  readonly data: ReviewSession;
}

interface FindingRecord {
  readonly type: "finding";
  readonly data: ReviewFinding;
}

type ReviewRecord = SessionRecord | FindingRecord;

const isReviewRecord = (obj: unknown): obj is ReviewRecord => {
  if (typeof obj !== "object" || obj === null) return false;
  const record = obj as Record<string, unknown>;
  return (
    (record.type === "session" || record.type === "finding") &&
    typeof record.data === "object" &&
    record.data !== null
  );
};

const parseSessionFile = (
  content: string,
): { session: ReviewSession; findings: readonly ReviewFinding[] } | null => {
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  let session: ReviewSession | null = null;
  const findings: ReviewFinding[] = [];

  for (const line of lines) {
    try {
      const parsed: unknown = JSON.parse(line);
      if (!isReviewRecord(parsed)) continue;
      if (parsed.type === "session") {
        session = parsed.data;
      } else {
        findings.push(parsed.data);
      }
    } catch {
      // skip malformed lines
    }
  }

  if (!session) return null;
  return { session, findings };
};

export const loadReviewSession = (
  rootDir: string,
  sessionId: string,
): { session: ReviewSession; findings: readonly ReviewFinding[] } => {
  const path = sessionPath(rootDir, sessionId);
  const content = readFileSync(path, "utf-8");
  const result = parseSessionFile(content);
  if (!result) {
    throw new Error(`invalid review session file: ${sessionId}`);
  }
  return result;
};

export const listReviewSessions = (
  rootDir: string,
): readonly ReviewSession[] => {
  const dir = reviewsPath(rootDir);
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const sessions: ReviewSession[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() || !entry.name.endsWith(".jsonl")) continue;
    try {
      const content = readFileSync(join(dir, entry.name), "utf-8");
      const result = parseSessionFile(content);
      if (result) sessions.push(result.session);
    } catch {
      // skip unreadable files
    }
  }

  // Newest first
  sessions.sort((a, b) =>
    a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0,
  );

  return sessions;
};
