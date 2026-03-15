import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadTelemetryRecords, streamTelemetryRecords } from "./reader.js";
import type { ModelCallRecord } from "./types.js";
import { useTempDir } from "../../test-utils.js";

const makeTempDir = useTempDir("telemetry-reader-test");

const makeRecord = (
  overrides: Partial<ModelCallRecord> = {},
): ModelCallRecord => ({
  id: "test-id",
  timestamp: "2026-03-09T10:00:00.000Z",
  component: "interview",
  model: "claude-sonnet-4-6",
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
  it("loads records from JSONL file", async () => {
    const rootDir = makeTempDir();
    const records = [
      makeRecord({ id: "1", inputTokens: 100 }),
      makeRecord({ id: "2", inputTokens: 200 }),
    ];
    writeTelemetry(rootDir, records);

    const result = await loadTelemetryRecords(rootDir);

    expect(result.records).toHaveLength(2);
    expect(result.records[0].inputTokens).toBe(100);
    expect(result.records[1].inputTokens).toBe(200);
    expect(result.invalidLineCount).toBe(0);
  });

  it("returns empty result when file does not exist", async () => {
    const rootDir = makeTempDir();

    const result = await loadTelemetryRecords(rootDir);

    expect(result.records).toEqual([]);
    expect(result.invalidLineCount).toBe(0);
  });

  it("returns empty result for an empty file", async () => {
    const rootDir = makeTempDir();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });
    writeFileSync(join(rootDir, ".telesis", "telemetry.jsonl"), "");

    const result = await loadTelemetryRecords(rootDir);

    expect(result.records).toEqual([]);
    expect(result.invalidLineCount).toBe(0);
  });

  it("skips malformed lines silently", async () => {
    const rootDir = makeTempDir();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });
    const content =
      JSON.stringify(makeRecord({ id: "good" })) +
      "\n" +
      "not valid json\n" +
      JSON.stringify(makeRecord({ id: "also-good" })) +
      "\n";
    writeFileSync(join(rootDir, ".telesis", "telemetry.jsonl"), content);

    const result = await loadTelemetryRecords(rootDir);

    expect(result.records).toHaveLength(2);
    expect(result.records[0].id).toBe("good");
    expect(result.records[1].id).toBe("also-good");
  });

  it("skips empty lines", async () => {
    const rootDir = makeTempDir();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });
    const content =
      JSON.stringify(makeRecord()) +
      "\n\n\n" +
      JSON.stringify(makeRecord()) +
      "\n";
    writeFileSync(join(rootDir, ".telesis", "telemetry.jsonl"), content);

    const result = await loadTelemetryRecords(rootDir);

    expect(result.records).toHaveLength(2);
  });

  it("skips records missing required fields", async () => {
    const rootDir = makeTempDir();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });
    const content =
      JSON.stringify(makeRecord({ id: "valid" })) +
      "\n" +
      JSON.stringify({ id: "missing-fields" }) +
      "\n";
    writeFileSync(join(rootDir, ".telesis", "telemetry.jsonl"), content);

    const result = await loadTelemetryRecords(rootDir);

    expect(result.records).toHaveLength(1);
    expect(result.records[0].id).toBe("valid");
  });

  it("preserves optional cache token fields", async () => {
    const rootDir = makeTempDir();
    writeTelemetry(rootDir, [
      makeRecord({ cacheReadTokens: 50, cacheWriteTokens: 75 }),
    ]);

    const { records } = await loadTelemetryRecords(rootDir);

    expect(records[0].cacheReadTokens).toBe(50);
    expect(records[0].cacheWriteTokens).toBe(75);
  });

  it("rejects records with invalid optional cache fields", async () => {
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

    const { records } = await loadTelemetryRecords(rootDir);

    expect(records).toHaveLength(0);
  });

  // JSON.stringify(NaN) and JSON.stringify(Infinity) produce null,
  // so these tests verify that null numeric fields are rejected.
  it("rejects records with null numeric fields (NaN serialized as null)", async () => {
    const rootDir = makeTempDir();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });
    // NaN → null in JSON; validator rejects null as non-numeric
    const record = { ...makeRecord(), inputTokens: NaN };
    writeFileSync(
      join(rootDir, ".telesis", "telemetry.jsonl"),
      JSON.stringify(record) + "\n",
    );

    const { records } = await loadTelemetryRecords(rootDir);

    expect(records).toHaveLength(0);
  });

  it("rejects records with negative token counts", async () => {
    const rootDir = makeTempDir();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });
    const record = { ...makeRecord(), outputTokens: -100 };
    writeFileSync(
      join(rootDir, ".telesis", "telemetry.jsonl"),
      JSON.stringify(record) + "\n",
    );

    const { records } = await loadTelemetryRecords(rootDir);

    expect(records).toHaveLength(0);
  });

  it("rejects records with null duration (Infinity serialized as null)", async () => {
    const rootDir = makeTempDir();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });
    // Infinity → null in JSON; validator rejects null as non-numeric
    const record = { ...makeRecord(), durationMs: Infinity };
    writeFileSync(
      join(rootDir, ".telesis", "telemetry.jsonl"),
      JSON.stringify(record) + "\n",
    );

    const { records } = await loadTelemetryRecords(rootDir);

    expect(records).toHaveLength(0);
  });
});

const collect = async (
  iter: AsyncIterable<ModelCallRecord>,
): Promise<ModelCallRecord[]> => {
  const results: ModelCallRecord[] = [];
  for await (const r of iter) results.push(r);
  return results;
};

describe("streamTelemetryRecords", () => {
  it("yields records in correct sequence", async () => {
    const rootDir = makeTempDir();
    const recs = [
      makeRecord({ id: "first", inputTokens: 100 }),
      makeRecord({ id: "second", inputTokens: 200 }),
      makeRecord({ id: "third", inputTokens: 300 }),
    ];
    writeTelemetry(rootDir, recs);
    const filePath = join(rootDir, ".telesis", "telemetry.jsonl");

    const results = await collect(streamTelemetryRecords(filePath));

    expect(results).toHaveLength(3);
    expect(results[0].id).toBe("first");
    expect(results[1].id).toBe("second");
    expect(results[2].id).toBe("third");
  });

  it("yields nothing for a missing file", async () => {
    const rootDir = makeTempDir();
    const filePath = join(rootDir, "nonexistent.jsonl");

    const results = await collect(streamTelemetryRecords(filePath));

    expect(results).toEqual([]);
  });

  it("skips malformed lines and invalid records", async () => {
    const rootDir = makeTempDir();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });
    const filePath = join(rootDir, ".telesis", "telemetry.jsonl");
    const content =
      [
        JSON.stringify(makeRecord({ id: "good-1" })),
        "not valid json",
        JSON.stringify({ id: "missing-fields" }),
        "",
        JSON.stringify(makeRecord({ id: "good-2" })),
      ].join("\n") + "\n";
    writeFileSync(filePath, content);

    const results = await collect(streamTelemetryRecords(filePath));

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("good-1");
    expect(results[1].id).toBe("good-2");
  });

  it("yields nothing for an empty file", async () => {
    const rootDir = makeTempDir();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });
    const filePath = join(rootDir, ".telesis", "telemetry.jsonl");
    writeFileSync(filePath, "");

    const results = await collect(streamTelemetryRecords(filePath));

    expect(results).toEqual([]);
  });
});
