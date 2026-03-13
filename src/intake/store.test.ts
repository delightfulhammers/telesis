import { describe, it, expect } from "vitest";
import { useTempDir } from "../test-utils.js";
import {
  createWorkItem,
  updateWorkItem,
  loadWorkItem,
  listWorkItems,
  findBySourceId,
} from "./store.js";
import type { WorkItem } from "./types.js";

const makeTempDir = useTempDir("intake-store");

const makeItem = (overrides: Partial<WorkItem> = {}): WorkItem => ({
  id: "abc-123-def",
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

describe("work item store", () => {
  it("creates and loads a work item", () => {
    const root = makeTempDir();
    const item = makeItem();

    createWorkItem(root, item);

    const loaded = loadWorkItem(root, item.id);
    expect(loaded).toEqual(item);
  });

  it("throws when creating a work item that already exists", () => {
    const root = makeTempDir();
    const item = makeItem();
    createWorkItem(root, item);

    expect(() => createWorkItem(root, item)).toThrow("already exists");
  });

  it("atomically updates a work item", () => {
    const root = makeTempDir();
    const item = makeItem();
    createWorkItem(root, item);

    const updated: WorkItem = {
      ...item,
      status: "approved",
      approvedAt: "2026-03-13T10:05:00.000Z",
    };
    updateWorkItem(root, updated);

    const loaded = loadWorkItem(root, item.id);
    expect(loaded?.status).toBe("approved");
    expect(loaded?.approvedAt).toBe("2026-03-13T10:05:00.000Z");
  });

  it("lists items sorted by importedAt descending", () => {
    const root = makeTempDir();

    createWorkItem(
      root,
      makeItem({
        id: "item-old",
        sourceId: "1",
        importedAt: "2026-03-13T09:00:00.000Z",
        title: "old",
      }),
    );
    createWorkItem(
      root,
      makeItem({
        id: "item-new",
        sourceId: "2",
        importedAt: "2026-03-13T11:00:00.000Z",
        title: "new",
      }),
    );
    createWorkItem(
      root,
      makeItem({
        id: "item-mid",
        sourceId: "3",
        importedAt: "2026-03-13T10:00:00.000Z",
        title: "mid",
      }),
    );

    const items = listWorkItems(root);
    expect(items).toHaveLength(3);
    expect(items[0]!.id).toBe("item-new");
    expect(items[1]!.id).toBe("item-mid");
    expect(items[2]!.id).toBe("item-old");
  });

  it("filters by status", () => {
    const root = makeTempDir();

    createWorkItem(
      root,
      makeItem({ id: "pending-1", sourceId: "1", status: "pending" }),
    );
    createWorkItem(
      root,
      makeItem({ id: "completed-1", sourceId: "2", status: "completed" }),
    );
    createWorkItem(
      root,
      makeItem({ id: "pending-2", sourceId: "3", status: "pending" }),
    );

    const pending = listWorkItems(root, { status: "pending" });
    expect(pending).toHaveLength(2);
    expect(pending.every((i) => i.status === "pending")).toBe(true);
  });

  it("returns empty list when intake directory does not exist", () => {
    const root = makeTempDir();
    expect(listWorkItems(root)).toEqual([]);
  });

  it("returns null for non-existent item", () => {
    const root = makeTempDir();
    expect(loadWorkItem(root, "nonexistent")).toBeNull();
  });

  it("returns null for empty string prefix", () => {
    const root = makeTempDir();
    createWorkItem(root, makeItem());
    expect(loadWorkItem(root, "")).toBeNull();
  });

  it("supports ID prefix matching", () => {
    const root = makeTempDir();
    createWorkItem(root, makeItem({ id: "abc-123-def-456" }));

    const loaded = loadWorkItem(root, "abc-123");
    expect(loaded?.id).toBe("abc-123-def-456");
  });

  it("returns null when prefix matches multiple items", () => {
    const root = makeTempDir();
    createWorkItem(root, makeItem({ id: "abc-111", sourceId: "1" }));
    createWorkItem(root, makeItem({ id: "abc-222", sourceId: "2" }));

    expect(loadWorkItem(root, "abc")).toBeNull();
  });

  it("finds item by source kind and sourceId", () => {
    const root = makeTempDir();
    createWorkItem(root, makeItem({ id: "item-1", sourceId: "42" }));
    createWorkItem(root, makeItem({ id: "item-2", sourceId: "99" }));

    const found = findBySourceId(root, "github", "42");
    expect(found?.id).toBe("item-1");
  });

  it("returns null when source ID not found", () => {
    const root = makeTempDir();
    createWorkItem(root, makeItem({ id: "item-1", sourceId: "42" }));

    expect(findBySourceId(root, "github", "999")).toBeNull();
  });

  it("tracks full status lifecycle", () => {
    const root = makeTempDir();
    const item = makeItem();
    createWorkItem(root, item);

    const approved: WorkItem = {
      ...item,
      status: "approved",
      approvedAt: "2026-03-13T10:01:00.000Z",
    };
    updateWorkItem(root, approved);
    expect(loadWorkItem(root, item.id)?.status).toBe("approved");

    const dispatching: WorkItem = {
      ...approved,
      status: "dispatching",
      dispatchedAt: "2026-03-13T10:02:00.000Z",
    };
    updateWorkItem(root, dispatching);
    expect(loadWorkItem(root, item.id)?.status).toBe("dispatching");

    const completed: WorkItem = {
      ...dispatching,
      status: "completed",
      completedAt: "2026-03-13T10:05:00.000Z",
      sessionId: "session-abc",
    };
    updateWorkItem(root, completed);

    const loaded = loadWorkItem(root, item.id);
    expect(loaded?.status).toBe("completed");
    expect(loaded?.sessionId).toBe("session-abc");
  });

  it("records failed status with error", () => {
    const root = makeTempDir();
    const item = makeItem();
    createWorkItem(root, item);

    const failed: WorkItem = {
      ...item,
      status: "failed",
      error: "agent crashed",
      completedAt: "2026-03-13T10:01:00.000Z",
    };
    updateWorkItem(root, failed);

    const loaded = loadWorkItem(root, item.id);
    expect(loaded?.status).toBe("failed");
    expect(loaded?.error).toBe("agent crashed");
  });
});
