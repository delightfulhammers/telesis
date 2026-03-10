import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { platform } from "node:process";
import { appendNote, loadNotes } from "./store.js";
import { useTempDir } from "../test-utils.js";

const makeTempDir = useTempDir("notes-store-test");

describe("appendNote", () => {
  it("creates a note with id, timestamp, text, and tags", () => {
    const rootDir = makeTempDir();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });

    const note = appendNote(rootDir, "test insight", ["git"]);

    expect(note.id).toBeDefined();
    expect(note.timestamp).toBeDefined();
    expect(note.text).toBe("test insight");
    expect(note.tags).toEqual(["git"]);
  });

  it("appends to notes.jsonl", () => {
    const rootDir = makeTempDir();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });

    appendNote(rootDir, "first", []);
    appendNote(rootDir, "second", ["tag"]);

    const content = readFileSync(
      join(rootDir, ".telesis", "notes.jsonl"),
      "utf-8",
    );
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);
  });

  it("creates .telesis directory if missing", () => {
    const rootDir = makeTempDir();

    const note = appendNote(rootDir, "test", []);

    expect(note.text).toBe("test");
    const content = readFileSync(
      join(rootDir, ".telesis", "notes.jsonl"),
      "utf-8",
    );
    expect(content).toContain("test");
  });

  it("throws on write failure", () => {
    if (platform === "win32") return;

    const rootDir = makeTempDir();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });
    // Make directory read-only so file creation fails
    chmodSync(join(rootDir, ".telesis"), 0o444);

    try {
      expect(() => appendNote(rootDir, "should fail", [])).toThrow();
    } finally {
      chmodSync(join(rootDir, ".telesis"), 0o755);
    }
  });

  it("preserves multiple tags", () => {
    const rootDir = makeTempDir();

    const note = appendNote(rootDir, "text", ["git", "config"]);

    expect(note.tags).toEqual(["git", "config"]);
  });

  it("rejects empty text", () => {
    const rootDir = makeTempDir();

    expect(() => appendNote(rootDir, "", [])).toThrow("empty");
    expect(() => appendNote(rootDir, "   ", [])).toThrow("empty");
  });

  it("trims text", () => {
    const rootDir = makeTempDir();

    const note = appendNote(rootDir, "  padded text  ", []);

    expect(note.text).toBe("padded text");
  });

  it("rejects oversized text", () => {
    const rootDir = makeTempDir();

    expect(() => appendNote(rootDir, "x".repeat(5000), [])).toThrow(
      "maximum length",
    );
  });

  it("rejects oversized tags", () => {
    const rootDir = makeTempDir();

    expect(() => appendNote(rootDir, "text", ["x".repeat(100)])).toThrow(
      "maximum length",
    );
  });

  it("trims and deduplicates tags", () => {
    const rootDir = makeTempDir();

    const note = appendNote(rootDir, "text", [
      " git ",
      "config",
      "git",
      "",
      " ",
    ]);

    expect(note.tags).toEqual(["git", "config"]);
  });
});

describe("loadNotes", () => {
  it("returns empty array when file does not exist", () => {
    const rootDir = makeTempDir();

    const notes = loadNotes(rootDir);

    expect(notes).toEqual([]);
  });

  it("round-trips notes through append and load", () => {
    const rootDir = makeTempDir();

    appendNote(rootDir, "first note", ["git"]);
    appendNote(rootDir, "second note", ["config", "build"]);

    const notes = loadNotes(rootDir);
    expect(notes).toHaveLength(2);
    expect(notes[0].text).toBe("first note");
    expect(notes[0].tags).toEqual(["git"]);
    expect(notes[1].text).toBe("second note");
    expect(notes[1].tags).toEqual(["config", "build"]);
  });

  it("skips malformed lines", () => {
    const rootDir = makeTempDir();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });

    const validNote = JSON.stringify({
      id: "abc",
      timestamp: "2026-03-10T00:00:00Z",
      text: "valid",
      tags: [],
    });
    const content = ["not json at all", validNote, '{"id": "def"}', ""].join(
      "\n",
    );
    writeFileSync(join(rootDir, ".telesis", "notes.jsonl"), content);

    const notes = loadNotes(rootDir);
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toBe("valid");
  });

  it("rejects records with missing fields", () => {
    const rootDir = makeTempDir();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });

    const incomplete = JSON.stringify({
      id: "abc",
      timestamp: "2026-03-10T00:00:00Z",
      text: "missing tags field",
    });
    writeFileSync(join(rootDir, ".telesis", "notes.jsonl"), incomplete + "\n");

    const notes = loadNotes(rootDir);
    expect(notes).toEqual([]);
  });

  it("rejects records with non-string tags", () => {
    const rootDir = makeTempDir();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });

    const bad = JSON.stringify({
      id: "abc",
      timestamp: "2026-03-10T00:00:00Z",
      text: "bad tags",
      tags: [1, 2],
    });
    writeFileSync(join(rootDir, ".telesis", "notes.jsonl"), bad + "\n");

    const notes = loadNotes(rootDir);
    expect(notes).toEqual([]);
  });
});
