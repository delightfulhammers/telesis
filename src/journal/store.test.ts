import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { platform } from "node:process";
import { appendEntry, loadEntries } from "./store.js";
import { useTempDir } from "../test-utils.js";

const makeTempDir = useTempDir("journal-store-test");

describe("appendEntry", () => {
  it("creates an entry with id, date, title, body, and timestamp", () => {
    const rootDir = makeTempDir();

    const entry = appendEntry(rootDir, "Design Decision", "We chose RxJS.");

    expect(entry.id).toBeDefined();
    expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(entry.title).toBe("Design Decision");
    expect(entry.body).toBe("We chose RxJS.");
    expect(entry.timestamp).toBeDefined();
  });

  it("appends to journal.jsonl", () => {
    const rootDir = makeTempDir();

    appendEntry(rootDir, "First", "Body one.");
    appendEntry(rootDir, "Second", "Body two.");

    const content = readFileSync(
      join(rootDir, ".telesis", "journal.jsonl"),
      "utf-8",
    );
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);
  });

  it("creates .telesis directory if missing", () => {
    const rootDir = makeTempDir();

    const entry = appendEntry(rootDir, "Title", "Body.");

    expect(entry.title).toBe("Title");
    const content = readFileSync(
      join(rootDir, ".telesis", "journal.jsonl"),
      "utf-8",
    );
    expect(content).toContain("Title");
  });

  it("trims title and body", () => {
    const rootDir = makeTempDir();

    const entry = appendEntry(rootDir, "  Padded Title  ", "  Padded body  ");

    expect(entry.title).toBe("Padded Title");
    expect(entry.body).toBe("Padded body");
  });

  it("rejects empty title", () => {
    const rootDir = makeTempDir();

    expect(() => appendEntry(rootDir, "", "Body.")).toThrow(
      "title cannot be empty",
    );
    expect(() => appendEntry(rootDir, "   ", "Body.")).toThrow(
      "title cannot be empty",
    );
  });

  it("rejects empty body", () => {
    const rootDir = makeTempDir();

    expect(() => appendEntry(rootDir, "Title", "")).toThrow(
      "body cannot be empty",
    );
    expect(() => appendEntry(rootDir, "Title", "   ")).toThrow(
      "body cannot be empty",
    );
  });

  it("rejects oversized title", () => {
    const rootDir = makeTempDir();

    expect(() => appendEntry(rootDir, "x".repeat(300), "Body.")).toThrow(
      "maximum length",
    );
  });

  it("allows large body content", () => {
    const rootDir = makeTempDir();
    const largeBody = "x".repeat(50_000);

    const entry = appendEntry(rootDir, "Title", largeBody);

    expect(entry.body).toBe(largeBody);
  });

  it("throws on write failure", () => {
    if (platform === "win32") return;

    const rootDir = makeTempDir();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });
    const { chmodSync } = require("node:fs");
    chmodSync(join(rootDir, ".telesis"), 0o444);

    try {
      expect(() => appendEntry(rootDir, "Title", "Body.")).toThrow();
    } finally {
      chmodSync(join(rootDir, ".telesis"), 0o755);
    }
  });
});

describe("loadEntries", () => {
  it("returns empty result when file does not exist", () => {
    const rootDir = makeTempDir();

    const result = loadEntries(rootDir);

    expect(result.items).toEqual([]);
    expect(result.invalidLineCount).toBe(0);
  });

  it("round-trips entries through append and load", () => {
    const rootDir = makeTempDir();

    appendEntry(rootDir, "First Entry", "Body one.");
    appendEntry(rootDir, "Second Entry", "Body two.");

    const { items } = loadEntries(rootDir);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("First Entry");
    expect(items[0].body).toBe("Body one.");
    expect(items[1].title).toBe("Second Entry");
    expect(items[1].body).toBe("Body two.");
  });

  it("skips malformed lines and reports count", () => {
    const rootDir = makeTempDir();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });

    const validEntry = JSON.stringify({
      id: "abc",
      date: "2026-03-12",
      title: "Valid",
      body: "Valid body.",
      timestamp: "2026-03-12T00:00:00Z",
    });
    const content = ["not json", validEntry, '{"id": "def"}', ""].join("\n");
    writeFileSync(join(rootDir, ".telesis", "journal.jsonl"), content);

    const { items, invalidLineCount } = loadEntries(rootDir);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Valid");
    expect(invalidLineCount).toBe(2);
  });

  it("rejects records with missing fields", () => {
    const rootDir = makeTempDir();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });

    const incomplete = JSON.stringify({
      id: "abc",
      date: "2026-03-12",
      title: "Missing body",
      timestamp: "2026-03-12T00:00:00Z",
    });
    writeFileSync(
      join(rootDir, ".telesis", "journal.jsonl"),
      incomplete + "\n",
    );

    const { items, invalidLineCount } = loadEntries(rootDir);
    expect(items).toEqual([]);
    expect(invalidLineCount).toBe(1);
  });
});
