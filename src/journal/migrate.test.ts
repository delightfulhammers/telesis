import { describe, it, expect } from "vitest";
import { parseMarkdownJournal } from "./migrate.js";

const SAMPLE_JOURNAL = `# Telesis — Design Journal

A place for exploratory thinking, observations, and emerging ideas.

---

## 2026-03-12 — The Shape of the Thing

### Where we are

Some content about where we are.

More content here.

---

## 2026-03-12 — Architecture Direction

### Key decisions

We decided to use a monolithic binary.

---

## 2026-03-11 — Earlier Entry

A standalone paragraph.
`;

describe("parseMarkdownJournal", () => {
  it("extracts all entries with date, title, and body", () => {
    const entries = parseMarkdownJournal(SAMPLE_JOURNAL);

    expect(entries).toHaveLength(3);
    expect(entries[0].date).toBe("2026-03-12");
    expect(entries[0].title).toBe("The Shape of the Thing");
    expect(entries[1].date).toBe("2026-03-12");
    expect(entries[1].title).toBe("Architecture Direction");
    expect(entries[2].date).toBe("2026-03-11");
    expect(entries[2].title).toBe("Earlier Entry");
  });

  it("captures body content between entries", () => {
    const entries = parseMarkdownJournal(SAMPLE_JOURNAL);

    expect(entries[0].body).toContain("### Where we are");
    expect(entries[0].body).toContain("Some content about where we are.");
    expect(entries[0].body).toContain("More content here.");
    expect(entries[1].body).toContain("We decided to use a monolithic binary.");
    expect(entries[2].body).toContain("A standalone paragraph.");
  });

  it("strips leading/trailing whitespace and separators from body", () => {
    const entries = parseMarkdownJournal(SAMPLE_JOURNAL);

    expect(entries[0].body).not.toMatch(/^\s*---/);
    expect(entries[0].body).not.toMatch(/---\s*$/);
  });

  it("returns empty array for empty input", () => {
    expect(parseMarkdownJournal("")).toEqual([]);
  });

  it("returns empty array for journal with no entries", () => {
    const headerOnly = `# Telesis — Design Journal

A description.

---
`;
    expect(parseMarkdownJournal(headerOnly)).toEqual([]);
  });

  it("handles entry at end of file without trailing separator", () => {
    const journal = `## 2026-03-12 — Solo Entry

Just one entry, no trailing separator.`;

    const entries = parseMarkdownJournal(journal);

    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe("Solo Entry");
    expect(entries[0].body).toBe("Just one entry, no trailing separator.");
  });
});
