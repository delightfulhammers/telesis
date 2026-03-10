import type { Note } from "./types.js";

const formatDate = (timestamp: string): string => timestamp.slice(0, 10);

const GENERAL_TAG = "General";

const byTimestampDesc = (a: Note, b: Note): number =>
  a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0;

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

    const addToGroup = (key: string): void => {
      let items = groups.get(key);
      if (!items) {
        items = [];
        groups.set(key, items);
      }
      items.push(entry);
    };

    if (note.tags.length === 0) {
      addToGroup(GENERAL_TAG);
    } else {
      for (const tag of note.tags) {
        addToGroup(tag);
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
