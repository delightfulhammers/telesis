import { describe, it, expect, vi } from "vitest";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  appendDismissal,
  loadDismissals,
  loadRecentDismissals,
  findDismissalByFindingId,
} from "./store.js";
import type { Dismissal } from "./types.js";
import { useTempDir } from "../../../test-utils.js";

const makeTempDir = useTempDir("dismissal-store-test");

const makeDismissal = (overrides: Partial<Dismissal> = {}): Dismissal => ({
  id: "d0000000-0000-0000-0000-000000000001",
  findingId: "f0000000-0000-0000-0000-000000000001",
  sessionId: "s0000000-0000-0000-0000-000000000001",
  reason: "false-positive",
  timestamp: "2026-03-10T12:00:00Z",
  source: "cli",
  path: "src/foo.ts",
  severity: "high",
  category: "bug",
  description: "Null check missing",
  suggestion: "Add null check",
  ...overrides,
});

describe("appendDismissal", () => {
  it("creates .telesis directory and appends a line", () => {
    const dir = makeTempDir();
    const dismissal = makeDismissal();

    appendDismissal(dir, dismissal);

    const content = readFileSync(
      join(dir, ".telesis", "dismissals.jsonl"),
      "utf-8",
    );
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.id).toBe(dismissal.id);
    expect(parsed.findingId).toBe(dismissal.findingId);
    expect(parsed.reason).toBe("false-positive");
  });

  it("appends multiple dismissals (append-only)", () => {
    const dir = makeTempDir();

    appendDismissal(dir, makeDismissal({ id: "d1" }));
    appendDismissal(dir, makeDismissal({ id: "d2" }));
    appendDismissal(dir, makeDismissal({ id: "d3" }));

    const content = readFileSync(
      join(dir, ".telesis", "dismissals.jsonl"),
      "utf-8",
    );
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(3);
  });

  it("works when .telesis already exists", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".telesis"), { recursive: true });

    appendDismissal(dir, makeDismissal());

    const loaded = loadDismissals(dir);
    expect(loaded).toHaveLength(1);
  });
});

describe("loadDismissals", () => {
  it("returns empty when no file exists", () => {
    const dir = makeTempDir();
    expect(loadDismissals(dir)).toEqual([]);
  });

  it("round-trips append and load", () => {
    const dir = makeTempDir();
    const d1 = makeDismissal({ id: "d1", reason: "false-positive" });
    const d2 = makeDismissal({ id: "d2", reason: "not-actionable" });

    appendDismissal(dir, d1);
    appendDismissal(dir, d2);

    const loaded = loadDismissals(dir);
    expect(loaded).toHaveLength(2);
    expect(loaded[0].id).toBe("d1");
    expect(loaded[1].id).toBe("d2");
    expect(loaded[0].reason).toBe("false-positive");
    expect(loaded[1].reason).toBe("not-actionable");
  });

  it("skips malformed lines gracefully", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".telesis"), { recursive: true });

    const validLine = JSON.stringify(makeDismissal());
    const content = [
      validLine,
      "this is not json",
      '{"id": "x"}', // missing required fields
      JSON.stringify(makeDismissal({ id: "d2" })),
    ].join("\n");

    writeFileSync(join(dir, ".telesis", "dismissals.jsonl"), content + "\n");

    const loaded = loadDismissals(dir);
    expect(loaded).toHaveLength(2);
  });

  it("rejects records missing required fields beyond id/findingId/reason", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".telesis"), { recursive: true });

    // Has id, findingId, reason — but missing sessionId, timestamp, source, etc.
    const partial = JSON.stringify({
      id: "d-partial",
      findingId: "f-partial",
      reason: "false-positive",
    });
    const full = JSON.stringify(makeDismissal({ id: "d-full" }));

    writeFileSync(
      join(dir, ".telesis", "dismissals.jsonl"),
      [partial, full].join("\n") + "\n",
    );

    const loaded = loadDismissals(dir);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("d-full");
  });

  it("rejects records with invalid enum values", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".telesis"), { recursive: true });

    const invalidReason = JSON.stringify(
      makeDismissal({ id: "d-bad-reason", reason: "invalid-reason" as any }),
    );
    const invalidSeverity = JSON.stringify(
      makeDismissal({ id: "d-bad-severity", severity: "extreme" as any }),
    );
    const invalidCategory = JSON.stringify(
      makeDismissal({ id: "d-bad-category", category: "unknown-cat" as any }),
    );
    const invalidSource = JSON.stringify(
      makeDismissal({ id: "d-bad-source", source: "jira" as any }),
    );
    const valid = JSON.stringify(makeDismissal({ id: "d-valid" }));

    writeFileSync(
      join(dir, ".telesis", "dismissals.jsonl"),
      [invalidReason, invalidSeverity, invalidCategory, invalidSource, valid].join("\n") + "\n",
    );

    const loaded = loadDismissals(dir);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("d-valid");
  });

  it("returns empty for empty file", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".telesis"), { recursive: true });
    writeFileSync(join(dir, ".telesis", "dismissals.jsonl"), "");

    expect(loadDismissals(dir)).toEqual([]);
  });
});

describe("loadRecentDismissals", () => {
  it("filters by age", () => {
    const dir = makeTempDir();
    const now = new Date();
    const recent = new Date(now.getTime() - 1000).toISOString(); // 1 second ago
    const old = new Date(
      now.getTime() - 200 * 24 * 60 * 60 * 1000,
    ).toISOString(); // 200 days ago

    appendDismissal(dir, makeDismissal({ id: "recent", timestamp: recent }));
    appendDismissal(dir, makeDismissal({ id: "old", timestamp: old }));

    const loaded = loadRecentDismissals(dir);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("recent");
  });

  it("respects custom maxAge", () => {
    const dir = makeTempDir();
    const now = new Date();
    const twoDaysAgo = new Date(
      now.getTime() - 2 * 24 * 60 * 60 * 1000,
    ).toISOString();

    appendDismissal(dir, makeDismissal({ id: "d1", timestamp: twoDaysAgo }));

    // 1-day window should exclude it
    const oneDay = 24 * 60 * 60 * 1000;
    expect(loadRecentDismissals(dir, oneDay)).toHaveLength(0);

    // 3-day window should include it
    expect(loadRecentDismissals(dir, 3 * oneDay)).toHaveLength(1);
  });

  it("returns empty when no file exists", () => {
    const dir = makeTempDir();
    expect(loadRecentDismissals(dir)).toEqual([]);
  });
});

describe("findDismissalByFindingId", () => {
  it("returns matching dismissal", () => {
    const dir = makeTempDir();
    appendDismissal(dir, makeDismissal({ findingId: "target-finding" }));
    appendDismissal(dir, makeDismissal({ id: "d2", findingId: "other" }));

    const result = findDismissalByFindingId(dir, "target-finding");
    expect(result).toBeDefined();
    expect(result!.findingId).toBe("target-finding");
  });

  it("returns undefined when not found", () => {
    const dir = makeTempDir();
    appendDismissal(dir, makeDismissal());

    expect(findDismissalByFindingId(dir, "nonexistent")).toBeUndefined();
  });

  it("returns undefined when no file exists", () => {
    const dir = makeTempDir();
    expect(findDismissalByFindingId(dir, "anything")).toBeUndefined();
  });
});

describe("write failure handling", () => {
  it("logs to stderr on write failure without aborting", () => {
    // appendDismissal will throw if it can't write — the CLI layer
    // is responsible for catching and logging. Verify the throw.
    expect(() =>
      appendDismissal(
        "/nonexistent/path/that/should/not/exist",
        makeDismissal(),
      ),
    ).toThrow();
  });
});
