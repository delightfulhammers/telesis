import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadTelemetryRecords } from "./reader.js";
import type { ModelCallRecord } from "./types.js";
import { useTempDir } from "../../test-utils.js";

const makeTempDir = useTempDir("telemetry-reader-test");

const makeRecord = (
  overrides: Partial<ModelCallRecord> = {},
): ModelCallRecord => ({
  id: "test-id",
  timestamp: "2026-03-09T10:00:00.000Z",
  component: "interview",
  model: "claude-sonnet-4-20250514",
  provider: "anthropic",
  inputTokens: 1000,
  outputTokens: 500,
  durationMs: 1500,
  sessionId: "test-session",
  ...overrides,
});

const writeTelemetry = (rootDir: string, records: ModelCallRecord[]): void => {
  mkdirSync(join(rootDir, ".telesis"), { recursive: true });
  const content = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  writeFileSync(join(rootDir, ".telesis", "telemetry.jsonl"), content);
};

describe("loadTelemetryRecords", () => {
  it("loads records from JSONL file", () => {
    const rootDir = makeTempDir();
    const records = [
      makeRecord({ id: "1", inputTokens: 100 }),
      makeRecord({ id: "2", inputTokens: 200 }),
    ];
    writeTelemetry(rootDir, records);

    const loaded = loadTelemetryRecords(rootDir);

    expect(loaded).toHaveLength(2);
    expect(loaded[0].inputTokens).toBe(100);
    expect(loaded[1].inputTokens).toBe(200);
  });

  it("returns empty array when file does not exist", () => {
    const rootDir = makeTempDir();

    const loaded = loadTelemetryRecords(rootDir);

    expect(loaded).toEqual([]);
  });

  it("skips malformed lines", () => {
    const rootDir = makeTempDir();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });
    const content =
      JSON.stringify(makeRecord({ id: "good" })) +
      "\n" +
      "not valid json\n" +
      JSON.stringify(makeRecord({ id: "also-good" })) +
      "\n";
    writeFileSync(join(rootDir, ".telesis", "telemetry.jsonl"), content);

    const loaded = loadTelemetryRecords(rootDir);

    expect(loaded).toHaveLength(2);
    expect(loaded[0].id).toBe("good");
    expect(loaded[1].id).toBe("also-good");
  });

  it("skips empty lines", () => {
    const rootDir = makeTempDir();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });
    const content =
      JSON.stringify(makeRecord()) +
      "\n\n\n" +
      JSON.stringify(makeRecord()) +
      "\n";
    writeFileSync(join(rootDir, ".telesis", "telemetry.jsonl"), content);

    const loaded = loadTelemetryRecords(rootDir);

    expect(loaded).toHaveLength(2);
  });

  it("skips records missing required fields", () => {
    const rootDir = makeTempDir();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });
    const content =
      JSON.stringify(makeRecord({ id: "valid" })) +
      "\n" +
      JSON.stringify({ id: "missing-fields" }) +
      "\n";
    writeFileSync(join(rootDir, ".telesis", "telemetry.jsonl"), content);

    const loaded = loadTelemetryRecords(rootDir);

    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("valid");
  });

  it("preserves optional cache token fields", () => {
    const rootDir = makeTempDir();
    writeTelemetry(rootDir, [
      makeRecord({ cacheReadTokens: 50, cacheWriteTokens: 75 }),
    ]);

    const loaded = loadTelemetryRecords(rootDir);

    expect(loaded[0].cacheReadTokens).toBe(50);
    expect(loaded[0].cacheWriteTokens).toBe(75);
  });

  it("rejects records with invalid optional cache fields", () => {
    const rootDir = makeTempDir();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });
    const record = {
      ...makeRecord({ id: "bad-cache" }),
      cacheReadTokens: "not-a-number",
    };
    writeFileSync(
      join(rootDir, ".telesis", "telemetry.jsonl"),
      JSON.stringify(record) + "\n",
    );

    const loaded = loadTelemetryRecords(rootDir);

    expect(loaded).toHaveLength(0);
  });

  // JSON.stringify(NaN) and JSON.stringify(Infinity) produce null,
  // so these tests verify that null numeric fields are rejected.
  it("rejects records with null numeric fields (NaN serialized as null)", () => {
    const rootDir = makeTempDir();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });
    // NaN → null in JSON; validator rejects null as non-numeric
    const record = { ...makeRecord(), inputTokens: NaN };
    writeFileSync(
      join(rootDir, ".telesis", "telemetry.jsonl"),
      JSON.stringify(record) + "\n",
    );

    const loaded = loadTelemetryRecords(rootDir);

    expect(loaded).toHaveLength(0);
  });

  it("rejects records with negative token counts", () => {
    const rootDir = makeTempDir();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });
    const record = { ...makeRecord(), outputTokens: -100 };
    writeFileSync(
      join(rootDir, ".telesis", "telemetry.jsonl"),
      JSON.stringify(record) + "\n",
    );

    const loaded = loadTelemetryRecords(rootDir);

    expect(loaded).toHaveLength(0);
  });

  it("rejects records with null duration (Infinity serialized as null)", () => {
    const rootDir = makeTempDir();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });
    // Infinity → null in JSON; validator rejects null as non-numeric
    const record = { ...makeRecord(), durationMs: Infinity };
    writeFileSync(
      join(rootDir, ".telesis", "telemetry.jsonl"),
      JSON.stringify(record) + "\n",
    );

    const loaded = loadTelemetryRecords(rootDir);

    expect(loaded).toHaveLength(0);
  });
});
