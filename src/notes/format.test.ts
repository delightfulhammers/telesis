import { describe, it, expect } from "vitest";
import { formatNoteList, renderNotesSection } from "./format.js";
import type { Note } from "./types.js";

const makeNote = (
  text: string,
  tags: readonly string[] = [],
  timestamp = "2026-03-10T12:00:00Z",
): Note => ({
  id: "test-id",
  timestamp,
  text,
  tags,
});

describe("formatNoteList", () => {
  it("returns empty string for no notes", () => {
    expect(formatNoteList([])).toBe("");
  });

  it("formats a single note", () => {
    const notes = [makeNote("SSH required", ["git"])];
    const output = formatNoteList(notes);
    expect(output).toBe("[2026-03-10] (git) SSH required");
  });

  it("formats multiple tags", () => {
    const notes = [makeNote("insight", ["git", "config"])];
    const output = formatNoteList(notes);
    expect(output).toContain("(git, config)");
  });

  it("omits tag label for untagged notes", () => {
    const notes = [makeNote("untagged insight")];
    const output = formatNoteList(notes);
    expect(output).toBe("[2026-03-10] untagged insight");
  });

  it("sorts by timestamp descending regardless of input order", () => {
    const notes = [
      makeNote("middle", ["a"], "2026-03-09T12:00:00Z"),
      makeNote("newest", ["b"], "2026-03-10T12:00:00Z"),
      makeNote("oldest", ["c"], "2026-03-08T12:00:00Z"),
    ];
    const output = formatNoteList(notes);
    const lines = output.split("\n");
    expect(lines[0]).toContain("newest");
    expect(lines[1]).toContain("middle");
    expect(lines[2]).toContain("oldest");
  });
});

describe("renderNotesSection", () => {
  it("returns empty string for no notes", () => {
    expect(renderNotesSection([])).toBe("");
  });

  it("groups notes by tag", () => {
    const notes = [
      makeNote("SSH required", ["git"], "2026-03-10T12:00:00Z"),
      makeNote("use /telesis", ["git"], "2026-03-09T12:00:00Z"),
    ];
    const output = renderNotesSection(notes);
    expect(output).toContain("### git");
    expect(output).toContain("- SSH required (2026-03-10)");
    expect(output).toContain("- use /telesis (2026-03-09)");
  });

  it("puts untagged notes under General", () => {
    const notes = [makeNote("bop v0.8.4 works")];
    const output = renderNotesSection(notes);
    expect(output).toContain("### General");
    expect(output).toContain("bop v0.8.4 works");
  });

  it("sorts tag groups alphabetically with General last", () => {
    const notes = [
      makeNote("untagged"),
      makeNote("git thing", ["git"]),
      makeNote("build thing", ["build"]),
    ];
    const output = renderNotesSection(notes);

    const buildIdx = output.indexOf("### build");
    const gitIdx = output.indexOf("### git");
    const generalIdx = output.indexOf("### General");

    expect(buildIdx).toBeLessThan(gitIdx);
    expect(gitIdx).toBeLessThan(generalIdx);
  });

  it("sorts entries within groups by timestamp descending", () => {
    const notes = [
      makeNote("oldest", ["git"], "2026-03-08T12:00:00Z"),
      makeNote("newest", ["git"], "2026-03-10T12:00:00Z"),
      makeNote("middle", ["git"], "2026-03-09T12:00:00Z"),
    ];
    const output = renderNotesSection(notes);
    const newestIdx = output.indexOf("newest");
    const middleIdx = output.indexOf("middle");
    const oldestIdx = output.indexOf("oldest");
    expect(newestIdx).toBeLessThan(middleIdx);
    expect(middleIdx).toBeLessThan(oldestIdx);
  });

  it("places multi-tagged notes in each tag group", () => {
    const notes = [makeNote("shared insight", ["git", "config"])];
    const output = renderNotesSection(notes);
    expect(output).toContain("### config");
    expect(output).toContain("### git");
    // Should appear under both groups
    const matches = output.match(/shared insight/g);
    expect(matches).toHaveLength(2);
  });
});
