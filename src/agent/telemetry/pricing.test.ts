import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { bootstrapPricing, loadPricing, calculateCost } from "./pricing.js";
import type { ModelCallRecord } from "./types.js";

const makeTempDir = (): string =>
  mkdtempSync(join(tmpdir(), "telesis-pricing-test-"));

const makeRecord = (
  overrides: Partial<ModelCallRecord> = {},
): ModelCallRecord => ({
  id: "test-id",
  timestamp: "2026-03-09T12:00:00Z",
  component: "interview",
  model: "claude-sonnet-4-20250514",
  provider: "anthropic",
  inputTokens: 1000,
  outputTokens: 500,
  durationMs: 1200,
  sessionId: "session-1",
  ...overrides,
});

describe("pricing", () => {
  describe("bootstrapPricing", () => {
    it("creates pricing.yml with default model pricing", () => {
      const rootDir = makeTempDir();
      mkdirSync(join(rootDir, ".telesis"), { recursive: true });

      bootstrapPricing(rootDir);

      const content = readFileSync(
        join(rootDir, ".telesis", "pricing.yml"),
        "utf-8",
      );
      expect(content).toContain("claude-sonnet-4-20250514");
      expect(content).toContain("inputPer1MTokens");
    });

    it("does not overwrite existing pricing.yml", () => {
      const rootDir = makeTempDir();
      const dir = join(rootDir, ".telesis");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "pricing.yml"), "custom: true\n");

      bootstrapPricing(rootDir);

      const content = readFileSync(join(dir, "pricing.yml"), "utf-8");
      expect(content).toBe("custom: true\n");
    });

    it("creates .telesis directory if it does not exist", () => {
      const rootDir = makeTempDir();

      bootstrapPricing(rootDir);

      const content = readFileSync(
        join(rootDir, ".telesis", "pricing.yml"),
        "utf-8",
      );
      expect(content).toContain("claude-sonnet-4-20250514");
    });
  });

  describe("loadPricing", () => {
    it("loads pricing from pricing.yml", () => {
      const rootDir = makeTempDir();
      mkdirSync(join(rootDir, ".telesis"), { recursive: true });
      bootstrapPricing(rootDir);

      const pricing = loadPricing(rootDir);

      expect(pricing.models["claude-sonnet-4-20250514"]).toBeDefined();
      expect(
        pricing.models["claude-sonnet-4-20250514"].inputPer1MTokens,
      ).toBeGreaterThan(0);
    });

    it("returns null when pricing.yml does not exist", () => {
      const rootDir = makeTempDir();
      const pricing = loadPricing(rootDir);
      expect(pricing).toBeNull();
    });
  });

  describe("calculateCost", () => {
    it("computes cost from token counts and pricing", () => {
      const records: ModelCallRecord[] = [
        makeRecord({ inputTokens: 1_000_000, outputTokens: 0 }),
      ];
      const pricing = {
        lastUpdated: "2026-03-09",
        models: {
          "claude-sonnet-4-20250514": {
            provider: "anthropic",
            inputPer1MTokens: 3.0,
            outputPer1MTokens: 15.0,
          },
        },
      };

      const cost = calculateCost(records, pricing);
      expect(cost).toBeCloseTo(3.0);
    });

    it("computes cost for output tokens", () => {
      const records: ModelCallRecord[] = [
        makeRecord({ inputTokens: 0, outputTokens: 1_000_000 }),
      ];
      const pricing = {
        lastUpdated: "2026-03-09",
        models: {
          "claude-sonnet-4-20250514": {
            provider: "anthropic",
            inputPer1MTokens: 3.0,
            outputPer1MTokens: 15.0,
          },
        },
      };

      const cost = calculateCost(records, pricing);
      expect(cost).toBeCloseTo(15.0);
    });

    it("sums cost across multiple records", () => {
      const records: ModelCallRecord[] = [
        makeRecord({ inputTokens: 500_000, outputTokens: 100_000 }),
        makeRecord({ inputTokens: 500_000, outputTokens: 100_000 }),
      ];
      const pricing = {
        lastUpdated: "2026-03-09",
        models: {
          "claude-sonnet-4-20250514": {
            provider: "anthropic",
            inputPer1MTokens: 3.0,
            outputPer1MTokens: 15.0,
          },
        },
      };

      // 1M input * $3/M + 200K output * $15/M = $3 + $3 = $6
      const cost = calculateCost(records, pricing);
      expect(cost).toBeCloseTo(6.0);
    });

    it("includes cache token costs when present", () => {
      const records: ModelCallRecord[] = [
        makeRecord({
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 1_000_000,
          cacheWriteTokens: 1_000_000,
        }),
      ];
      const pricing = {
        lastUpdated: "2026-03-09",
        models: {
          "claude-sonnet-4-20250514": {
            provider: "anthropic",
            inputPer1MTokens: 3.0,
            outputPer1MTokens: 15.0,
            cacheReadPer1MTokens: 0.3,
            cacheWritePer1MTokens: 3.75,
          },
        },
      };

      const cost = calculateCost(records, pricing);
      expect(cost).toBeCloseTo(4.05);
    });

    it("skips records with unknown models", () => {
      const records: ModelCallRecord[] = [
        makeRecord({ model: "unknown-model", inputTokens: 1_000_000 }),
      ];
      const pricing = {
        lastUpdated: "2026-03-09",
        models: {
          "claude-sonnet-4-20250514": {
            provider: "anthropic",
            inputPer1MTokens: 3.0,
            outputPer1MTokens: 15.0,
          },
        },
      };

      const cost = calculateCost(records, pricing);
      expect(cost).toBe(0);
    });

    it("returns zero for empty records", () => {
      const pricing = {
        lastUpdated: "2026-03-09",
        models: {},
      };
      expect(calculateCost([], pricing)).toBe(0);
    });
  });
});
