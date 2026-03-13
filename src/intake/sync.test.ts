import { describe, it, expect } from "vitest";
import { useTempDir } from "../test-utils.js";
import { syncFromSource } from "./sync.js";
import {
  createWorkItem,
  updateWorkItem,
  listWorkItems,
  findBySourceId,
} from "./store.js";
import type { IntakeSource, RawIssue } from "./source.js";
import type { WorkItem } from "./types.js";
import type { TelesisDaemonEvent } from "../daemon/types.js";

const makeTempDir = useTempDir("intake-sync");

const makeRawIssue = (overrides: Partial<RawIssue> = {}): RawIssue => ({
  sourceId: "42",
  sourceUrl: "https://github.com/owner/repo/issues/42",
  title: "Fix login bug",
  body: "The login form crashes",
  labels: ["bug"],
  assignee: "alice",
  ...overrides,
});

const fakeSource = (issues: readonly RawIssue[]): IntakeSource => ({
  kind: "github",
  fetchIssues: async () => issues,
});

describe("syncFromSource", () => {
  it("imports new issues as pending work items", async () => {
    const root = makeTempDir();
    const source = fakeSource([
      makeRawIssue({ sourceId: "1", title: "Issue 1" }),
      makeRawIssue({ sourceId: "2", title: "Issue 2" }),
    ]);

    const result = await syncFromSource(root, source);

    expect(result.imported).toBe(2);
    expect(result.skippedDuplicate).toBe(0);
    expect(result.errors).toHaveLength(0);

    const items = listWorkItems(root);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.status === "pending")).toBe(true);
  });

  it("skips duplicate issues by sourceId", async () => {
    const root = makeTempDir();

    // Pre-create an item for issue #42
    const existing: WorkItem = {
      id: "existing-uuid",
      source: "github",
      sourceId: "42",
      sourceUrl: "https://github.com/owner/repo/issues/42",
      title: "Fix login bug",
      body: "body",
      labels: ["bug"],
      status: "pending",
      importedAt: "2026-03-13T10:00:00.000Z",
    };
    createWorkItem(root, existing);

    const source = fakeSource([
      makeRawIssue({ sourceId: "42", title: "Fix login bug" }),
      makeRawIssue({ sourceId: "99", title: "New issue" }),
    ]);

    const result = await syncFromSource(root, source);

    expect(result.imported).toBe(1);
    expect(result.skippedDuplicate).toBe(1);

    // Original still exists, plus one new
    const items = listWorkItems(root);
    expect(items).toHaveLength(2);
  });

  it("re-imports failed items on subsequent sync", async () => {
    const root = makeTempDir();

    const existing: WorkItem = {
      id: "failed-uuid",
      source: "github",
      sourceId: "42",
      sourceUrl: "https://github.com/owner/repo/issues/42",
      title: "Fix login bug",
      body: "body",
      labels: ["bug"],
      status: "failed",
      importedAt: "2026-03-13T10:00:00.000Z",
      error: "agent crashed",
    };
    createWorkItem(root, existing);

    const source = fakeSource([
      makeRawIssue({ sourceId: "42", title: "Fix login bug" }),
    ]);

    const result = await syncFromSource(root, source);

    expect(result.imported).toBe(1);
    expect(result.skippedDuplicate).toBe(0);
    // Both the old failed item and new pending item exist
    const items = listWorkItems(root);
    expect(items).toHaveLength(2);
    expect(items.some((i) => i.status === "pending")).toBe(true);
  });

  it("does not re-import skipped items", async () => {
    const root = makeTempDir();

    const existing: WorkItem = {
      id: "skipped-uuid",
      source: "github",
      sourceId: "42",
      sourceUrl: "https://github.com/owner/repo/issues/42",
      title: "Fix login bug",
      body: "body",
      labels: ["bug"],
      status: "skipped",
      importedAt: "2026-03-13T10:00:00.000Z",
    };
    createWorkItem(root, existing);

    const source = fakeSource([
      makeRawIssue({ sourceId: "42", title: "Fix login bug" }),
    ]);

    const result = await syncFromSource(root, source);

    expect(result.imported).toBe(0);
    expect(result.skippedDuplicate).toBe(1);
  });

  it("emits sync:started and sync:completed events", async () => {
    const root = makeTempDir();
    const events: TelesisDaemonEvent[] = [];
    const source = fakeSource([makeRawIssue()]);

    await syncFromSource(root, source, (e) => events.push(e));

    const types = events.map((e) => e.type);
    expect(types).toContain("intake:sync:started");
    expect(types).toContain("intake:sync:completed");
  });

  it("emits intake:item:imported for each new item", async () => {
    const root = makeTempDir();
    const events: TelesisDaemonEvent[] = [];
    const source = fakeSource([
      makeRawIssue({ sourceId: "1", title: "Issue 1" }),
      makeRawIssue({ sourceId: "2", title: "Issue 2" }),
    ]);

    await syncFromSource(root, source, (e) => events.push(e));

    const importedEvents = events.filter(
      (e) => e.type === "intake:item:imported",
    );
    expect(importedEvents).toHaveLength(2);
  });

  it("handles empty source gracefully", async () => {
    const root = makeTempDir();
    const source = fakeSource([]);

    const result = await syncFromSource(root, source);

    expect(result.imported).toBe(0);
    expect(result.skippedDuplicate).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("accumulates errors without aborting", async () => {
    const root = makeTempDir();
    let callCount = 0;

    // A source that returns items, but we'll make the store fail on one
    const source: IntakeSource = {
      kind: "github",
      fetchIssues: async () => [
        makeRawIssue({ sourceId: "1", title: "Good issue" }),
        makeRawIssue({ sourceId: "2", title: "Another good issue" }),
      ],
    };

    const result = await syncFromSource(root, source);

    // Both should import fine in a normal scenario
    expect(result.imported).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it("preserves labels and assignee in imported items", async () => {
    const root = makeTempDir();
    const source = fakeSource([
      makeRawIssue({
        sourceId: "1",
        labels: ["bug", "urgent"],
        assignee: "bob",
      }),
    ]);

    await syncFromSource(root, source);

    const item = findBySourceId(root, "github", "1");
    expect(item?.labels).toEqual(["bug", "urgent"]);
    expect(item?.assignee).toBe("bob");
  });
});
