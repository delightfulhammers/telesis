import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { Note } from "./types.js";

const NOTES_PATH = ".telesis/notes.jsonl";

const isValidNote = (val: unknown): val is Note => {
  if (!val || typeof val !== "object") return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.timestamp === "string" &&
    typeof obj.text === "string" &&
    Array.isArray(obj.tags) &&
    obj.tags.every((t: unknown) => typeof t === "string")
  );
};

export const appendNote = (
  rootDir: string,
  text: string,
  tags: readonly string[],
): Note => {
  const resolvedRoot = resolve(rootDir);
  const telesisDir = join(resolvedRoot, ".telesis");
  const notesPath = join(resolvedRoot, NOTES_PATH);

  const note: Note = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    text,
    tags,
  };

  mkdirSync(telesisDir, { recursive: true });
  appendFileSync(notesPath, JSON.stringify(note) + "\n");

  return note;
};

export const loadNotes = (rootDir: string): readonly Note[] => {
  const resolvedRoot = resolve(rootDir);
  const filePath = join(resolvedRoot, NOTES_PATH);

  let data: string;
  try {
    data = readFileSync(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  return data
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => {
      try {
        const parsed: unknown = JSON.parse(line);
        return isValidNote(parsed) ? [parsed] : [];
      } catch {
        return [];
      }
    });
};
