import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, readFileSync, mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createTelemetryLogger } from "./logger.js";
import type { ModelCallRecord } from "./types.js";

const makeTempDir = (): string =>
  mkdtempSync(join(tmpdir(), "telesis-telemetry-test-"));

const makeRecord = (
  overrides: Partial<ModelCallRecord> = {},
): ModelCallRecord => ({
  id: "test-id-1",
  timestamp: "2026-03-09T12:00:00Z",
  component: "interview",
  model: "claude-sonnet-4-20250514",
  provider: "anthropic",
  inputTokens: 100,
  outputTokens: 50,
  durationMs: 1200,
  sessionId: "session-1",
  ...overrides,
});

describe("TelemetryLogger", () => {
  it("creates telemetry file and writes a JSONL record", () => {
    const rootDir = makeTempDir();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });
    const logger = createTelemetryLogger(rootDir);

    const record = makeRecord();
    logger.log(record);

    const content = readFileSync(
      join(rootDir, ".telesis", "telemetry.jsonl"),
      "utf-8",
    );
    const parsed = JSON.parse(content.trim());
    expect(parsed.id).toBe("test-id-1");
    expect(parsed.inputTokens).toBe(100);
    expect(parsed.outputTokens).toBe(50);
  });

  it("appends multiple records as separate lines", () => {
    const rootDir = makeTempDir();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });
    const logger = createTelemetryLogger(rootDir);

    logger.log(makeRecord({ id: "record-1" }));
    logger.log(makeRecord({ id: "record-2" }));
    logger.log(makeRecord({ id: "record-3" }));

    const lines = readFileSync(
      join(rootDir, ".telesis", "telemetry.jsonl"),
      "utf-8",
    )
      .trim()
      .split("\n");

    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0]).id).toBe("record-1");
    expect(JSON.parse(lines[1]).id).toBe("record-2");
    expect(JSON.parse(lines[2]).id).toBe("record-3");
  });

  it("includes optional cache token fields when present", () => {
    const rootDir = makeTempDir();
    mkdirSync(join(rootDir, ".telesis"), { recursive: true });
    const logger = createTelemetryLogger(rootDir);

    logger.log(makeRecord({ cacheReadTokens: 80, cacheWriteTokens: 20 }));

    const content = readFileSync(
      join(rootDir, ".telesis", "telemetry.jsonl"),
      "utf-8",
    );
    const parsed = JSON.parse(content.trim());
    expect(parsed.cacheReadTokens).toBe(80);
    expect(parsed.cacheWriteTokens).toBe(20);
  });

  it("creates .telesis directory if it does not exist", () => {
    const rootDir = makeTempDir();
    const logger = createTelemetryLogger(rootDir);

    logger.log(makeRecord());

    const content = readFileSync(
      join(rootDir, ".telesis", "telemetry.jsonl"),
      "utf-8",
    );
    expect(JSON.parse(content.trim()).id).toBe("test-id-1");
  });

  it("logs to stderr and does not throw on write failure", () => {
    const rootDir = makeTempDir();
    chmodSync(rootDir, 0o444);

    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const logger = createTelemetryLogger(rootDir);
      expect(() => logger.log(makeRecord())).not.toThrow();
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining("telemetry write failed"),
      );
    } finally {
      chmodSync(rootDir, 0o755);
      stderrSpy.mockRestore();
    }
  });
});
