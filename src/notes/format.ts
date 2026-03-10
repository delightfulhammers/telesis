import type { Note } from "./types.js";

const formatDate = (timestamp: string): string => {
  const d = new Date(timestamp);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const GENERAL_TAG = "General";

const byTimestampDesc = (a: Note, b: Note): number =>
  b.timestamp.localeCompare(a.timestamp);

export const formatNoteList = (notes: readonly Note[]): string => {
  if (notes.length === 0) return "";

  return [...notes]
    .sort(byTimestampDesc)
    .map((note) => {
      const date = formatDate(note.timestamp);
      const tagLabel = note.tags.length > 0 ? ` (${note.tags.join(", ")})` : "";
      return `[${date}]${tagLabel} ${note.text}`;
    })
    .join("\n");
};

export const renderNotesSection = (notes: readonly Note[]): string => {
  if (notes.length === 0) return "";

  const sorted = [...notes].sort(byTimestampDesc);

  const groups = new Map<string, { text: string; date: string }[]>();

  for (const note of sorted) {
    const date = formatDate(note.timestamp);
    const entry = { text: note.text, date };

    if (note.tags.length === 0) {
      const items = groups.get(GENERAL_TAG) ?? [];
      items.push(entry);
      groups.set(GENERAL_TAG, items);
    } else {
      for (const tag of note.tags) {
        const items = groups.get(tag) ?? [];
        items.push(entry);
        groups.set(tag, items);
      }
    }
  }

  // Sort tag groups alphabetically, but General goes last
  const sortedTags = [...groups.keys()].sort((a, b) => {
    if (a === GENERAL_TAG) return 1;
    if (b === GENERAL_TAG) return -1;
    return a.localeCompare(b);
  });

  const sections = sortedTags.map((tag) => {
    const items = groups.get(tag)!;
    const lines = items.map((item) => `- ${item.text} (${item.date})`);
    return `### ${tag}\n${lines.join("\n")}`;
  });

  return sections.join("\n\n");
};
