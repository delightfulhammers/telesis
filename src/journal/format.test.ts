import { describe, it, expect } from "vitest";
import {
  formatEntryList,
  renderJournalSection,
  formatEntryDetail,
} from "./format.js";
import type { JournalEntry } from "./types.js";

const makeEntry = (overrides: Partial<JournalEntry> = {}): JournalEntry => ({
  id: "test-id",
  date: "2026-03-12",
  title: "Test Entry",
  body: "Some exploratory thinking.",
  timestamp: "2026-03-12T10:00:00Z",
  ...overrides,
});

describe("formatEntryList", () => {
  it("returns empty string for no entries", () => {
    expect(formatEntryList([])).toBe("");
  });

  it("formats entries with date and title", () => {
    const entries = [
      makeEntry({ title: "First", date: "2026-03-12" }),
      makeEntry({ title: "Second", date: "2026-03-11" }),
    ];

    const result = formatEntryList(entries);

    expect(result).toContain("[2026-03-12] First");
    expect(result).toContain("[2026-03-11] Second");
  });

  it("sorts entries by timestamp descending", () => {
    const entries = [
      makeEntry({ title: "Older", timestamp: "2026-03-10T10:00:00Z" }),
      makeEntry({ title: "Newer", timestamp: "2026-03-12T10:00:00Z" }),
    ];

    const result = formatEntryList(entries);
    const lines = result.split("\n");

    expect(lines[0]).toContain("Newer");
    expect(lines[1]).toContain("Older");
  });
});

describe("formatEntryDetail", () => {
  it("formats an entry with title, date, and body", () => {
    const entry = makeEntry({
      title: "Design Decision",
      date: "2026-03-12",
      body: "We chose RxJS for the event backbone.",
    });

    const result = formatEntryDetail(entry);

    expect(result).toContain("Design Decision");
    expect(result).toContain("2026-03-12");
    expect(result).toContain("We chose RxJS for the event backbone.");
  });
});

describe("renderJournalSection", () => {
  it("returns empty string for no entries", () => {
    expect(renderJournalSection([])).toBe("");
  });

  it("renders recent entry titles for CLAUDE.md", () => {
    const entries = [
      makeEntry({ title: "First", timestamp: "2026-03-10T10:00:00Z" }),
      makeEntry({ title: "Second", timestamp: "2026-03-11T10:00:00Z" }),
      makeEntry({ title: "Third", timestamp: "2026-03-12T10:00:00Z" }),
    ];

    const result = renderJournalSection(entries);

    expect(result).toContain("Third");
    expect(result).toContain("Second");
    expect(result).toContain("First");
  });

  it("limits to 3 most recent entries", () => {
    const entries = [
      makeEntry({ title: "Old", timestamp: "2026-03-08T10:00:00Z" }),
      makeEntry({ title: "A", timestamp: "2026-03-09T10:00:00Z" }),
      makeEntry({ title: "B", timestamp: "2026-03-10T10:00:00Z" }),
      makeEntry({ title: "C", timestamp: "2026-03-12T10:00:00Z" }),
    ];

    const result = renderJournalSection(entries);

    expect(result).toContain("C");
    expect(result).toContain("B");
    expect(result).toContain("A");
    expect(result).not.toContain("Old");
  });

  it("includes dates alongside titles", () => {
    const entries = [
      makeEntry({
        title: "Entry",
        date: "2026-03-12",
        timestamp: "2026-03-12T10:00:00Z",
      }),
    ];

    const result = renderJournalSection(entries);

    expect(result).toContain("2026-03-12");
    expect(result).toContain("Entry");
  });
});
