import { describe, it, expect } from "vitest";
import { formatWorkItemList, formatWorkItemDetail } from "./format.js";
import type { WorkItem } from "./types.js";

const makeItem = (overrides: Partial<WorkItem> = {}): WorkItem => ({
  id: "abc12345-def6-7890-abcd-ef0123456789",
  source: "github",
  sourceId: "42",
  sourceUrl: "https://github.com/owner/repo/issues/42",
  title: "Fix login bug",
  body: "The login form crashes on submit",
  labels: ["bug"],
  status: "pending",
  importedAt: "2026-03-13T10:00:00.000Z",
  ...overrides,
});

describe("formatWorkItemList", () => {
  it("returns empty message when no items", () => {
    expect(formatWorkItemList([])).toBe("No work items.");
  });

  it("formats items as a table with header", () => {
    const items = [makeItem()];
    const output = formatWorkItemList(items);

    expect(output).toContain("ID");
    expect(output).toContain("STATUS");
    expect(output).toContain("abc12345");
    expect(output).toContain("pending");
    expect(output).toContain("github#42");
    expect(output).toContain("Fix login bug");
  });

  it("truncates long titles", () => {
    const longTitle = "A".repeat(60);
    const items = [makeItem({ title: longTitle })];
    const output = formatWorkItemList(items);

    expect(output).toContain("…");
    expect(output).not.toContain("A".repeat(60));
  });

  it("formats multiple items", () => {
    const items = [
      makeItem({ id: "item-1", sourceId: "1", title: "First" }),
      makeItem({ id: "item-2", sourceId: "2", title: "Second" }),
    ];
    const output = formatWorkItemList(items);
    const lines = output.split("\n");

    expect(lines).toHaveLength(3); // header + 2 items
  });
});

describe("formatWorkItemDetail", () => {
  it("includes all basic fields", () => {
    const output = formatWorkItemDetail(makeItem());

    expect(output).toContain("abc12345-def6-7890-abcd-ef0123456789");
    expect(output).toContain("github#42");
    expect(output).toContain("https://github.com/owner/repo/issues/42");
    expect(output).toContain("Fix login bug");
    expect(output).toContain("pending");
    expect(output).toContain("bug");
  });

  it("includes optional fields when present", () => {
    const item = makeItem({
      status: "completed",
      approvedAt: "2026-03-13T10:01:00.000Z",
      dispatchedAt: "2026-03-13T10:02:00.000Z",
      completedAt: "2026-03-13T10:05:00.000Z",
      sessionId: "session-xyz",
      assignee: "alice",
    });
    const output = formatWorkItemDetail(item);

    expect(output).toContain("Approved:");
    expect(output).toContain("Dispatched:");
    expect(output).toContain("Completed:");
    expect(output).toContain("session-xyz");
    expect(output).toContain("alice");
  });

  it("omits optional fields when absent", () => {
    const output = formatWorkItemDetail(makeItem());

    expect(output).not.toContain("Approved:");
    expect(output).not.toContain("Session:");
    expect(output).not.toContain("Error:");
  });

  it("shows error when present", () => {
    const item = makeItem({ status: "failed", error: "agent crashed" });
    const output = formatWorkItemDetail(item);

    expect(output).toContain("agent crashed");
  });

  it("includes body text", () => {
    const output = formatWorkItemDetail(makeItem());
    expect(output).toContain("The login form crashes on submit");
  });

  it("shows placeholder for empty body", () => {
    const item = makeItem({ body: "" });
    const output = formatWorkItemDetail(item);
    expect(output).toContain("(no description)");
  });
});
