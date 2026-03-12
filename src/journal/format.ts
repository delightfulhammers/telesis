import type { JournalEntry } from "./types.js";

const MAX_RECENT = 3;

const byTimestampDesc = (a: JournalEntry, b: JournalEntry): number =>
  a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0;

export const formatEntryList = (entries: readonly JournalEntry[]): string => {
  if (entries.length === 0) return "";

  return [...entries]
    .sort(byTimestampDesc)
    .map((e) => `[${e.date}] ${e.title}`)
    .join("\n");
};

export const formatEntryDetail = (entry: JournalEntry): string =>
  `## ${entry.date} — ${entry.title}\n\n${entry.body}`;

export const renderJournalSection = (
  entries: readonly JournalEntry[],
): string => {
  if (entries.length === 0) return "";

  const recent = [...entries].sort(byTimestampDesc).slice(0, MAX_RECENT);

  return recent.map((e) => `- ${e.date} — ${e.title}`).join("\n");
};
