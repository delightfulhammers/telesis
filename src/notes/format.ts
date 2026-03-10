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

interface GroupEntry {
  readonly text: string;
  readonly date: string;
  readonly timestamp: string;
}

const byEntryTimestampDesc = (a: GroupEntry, b: GroupEntry): number =>
  a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0;

export const renderNotesSection = (notes: readonly Note[]): string => {
  if (notes.length === 0) return "";

  const groups = new Map<string, GroupEntry[]>();

  const addToGroup = (key: string, entry: GroupEntry): void => {
    let items = groups.get(key);
    if (!items) {
      items = [];
      groups.set(key, items);
    }
    items.push(entry);
  };

  for (const note of notes) {
    const entry: GroupEntry = {
      text: note.text,
      date: formatDate(note.timestamp),
      timestamp: note.timestamp,
    };

    if (note.tags.length === 0) {
      addToGroup(GENERAL_TAG, entry);
    } else {
      for (const tag of note.tags) {
        addToGroup(tag, entry);
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
    const items = groups.get(tag)!.sort(byEntryTimestampDesc);
    const lines = items.map((item) => `- ${item.text} (${item.date})`);
    return `### ${tag}\n${lines.join("\n")}`;
  });

  return sections.join("\n\n");
};
