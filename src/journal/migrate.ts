import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { JournalEntry } from "./types.js";

const ENTRY_HEADER_RE = /^## (\d{4}-\d{2}-\d{2}) — (.+)$/;

interface ParsedEntry {
  readonly date: string;
  readonly title: string;
  readonly body: string;
}

export const parseMarkdownJournal = (
  content: string,
): readonly ParsedEntry[] => {
  if (!content.trim()) return [];

  const lines = content.split("\n");
  const entries: ParsedEntry[] = [];
  let current: { date: string; title: string; bodyLines: string[] } | null =
    null;

  const flushCurrent = (): void => {
    if (!current) return;
    const body = current.bodyLines
      .join("\n")
      .replace(/^\s*---\s*/g, "")
      .replace(/\s*---\s*$/g, "")
      .trim();
    entries.push({ date: current.date, title: current.title, body });
    current = null;
  };

  for (const line of lines) {
    const match = ENTRY_HEADER_RE.exec(line);
    if (match) {
      flushCurrent();
      current = { date: match[1], title: match[2], bodyLines: [] };
      continue;
    }
    if (current) {
      current.bodyLines.push(line);
    }
  }

  flushCurrent();
  return entries;
};

export const migrateMarkdownToEntries = (
  markdownPath: string,
): readonly JournalEntry[] => {
  const content = readFileSync(markdownPath, "utf-8");
  const parsed = parseMarkdownJournal(content);

  return parsed.map((p, i) => ({
    id: randomUUID(),
    date: p.date,
    title: p.title,
    body: p.body,
    // Space entries 1 minute apart to preserve ordering within same date
    timestamp: `${p.date}T10:${String(i).padStart(2, "0")}:00Z`,
  }));
};
