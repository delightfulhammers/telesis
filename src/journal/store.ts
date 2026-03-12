import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { JournalEntry } from "./types.js";

const JOURNAL_PATH = ".telesis/journal.jsonl";

const MAX_TITLE_LENGTH = 200;

const isValidEntry = (val: unknown): val is JournalEntry => {
  if (!val || typeof val !== "object") return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.date === "string" &&
    typeof obj.title === "string" &&
    typeof obj.body === "string" &&
    typeof obj.timestamp === "string"
  );
};

const formatDate = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const appendEntry = (
  rootDir: string,
  title: string,
  body: string,
): JournalEntry => {
  const trimmedTitle = title.trim();
  if (trimmedTitle.length === 0) {
    throw new Error("title cannot be empty");
  }
  if (trimmedTitle.length > MAX_TITLE_LENGTH) {
    throw new Error(
      `title exceeds maximum length of ${MAX_TITLE_LENGTH} characters`,
    );
  }

  const trimmedBody = body.trim();
  if (trimmedBody.length === 0) {
    throw new Error("body cannot be empty");
  }

  const resolvedRoot = resolve(rootDir);
  const telesisDir = join(resolvedRoot, ".telesis");
  const journalPath = join(resolvedRoot, JOURNAL_PATH);

  const now = new Date();
  const entry: JournalEntry = {
    id: randomUUID(),
    date: formatDate(now),
    title: trimmedTitle,
    body: trimmedBody,
    timestamp: now.toISOString(),
  };

  mkdirSync(telesisDir, { recursive: true });
  appendFileSync(journalPath, JSON.stringify(entry) + "\n");

  return entry;
};

export interface LoadEntriesResult {
  readonly items: readonly JournalEntry[];
  readonly invalidLineCount: number;
}

export const loadEntries = (rootDir: string): LoadEntriesResult => {
  const resolvedRoot = resolve(rootDir);
  const filePath = join(resolvedRoot, JOURNAL_PATH);

  let data: string;
  try {
    data = readFileSync(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT")
      return { items: [], invalidLineCount: 0 };
    throw err;
  }

  const items: JournalEntry[] = [];
  let invalidLineCount = 0;

  for (const line of data.split("\n")) {
    if (line.trim().length === 0) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (isValidEntry(parsed)) {
        items.push(parsed);
      } else {
        invalidLineCount++;
      }
    } catch {
      invalidLineCount++;
    }
  }

  return { items, invalidLineCount };
};
