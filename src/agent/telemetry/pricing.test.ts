import { describe, it, expect } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bootstrapPricing, loadPricing, calculateCost } from "./pricing.js";
import type { ModelCallRecord } from "./types.js";
import { useTempDir } from "../../test-utils.js";

const makeTempDir = useTempDir("pricing-test");

const makeRecord = (
  overrides: Partial<ModelCallRecord> = {},
): ModelCallRecord => ({
  id: "test-id",
  timestamp: "2026-03-09T12:00:00Z",
  component: "interview",
  model: "claude-sonnet-4-6",
  provider: "anthropic",
  inputTokens: 1000,
  outputTokens: 500,
  durationMs: 1200,
  sessionId: "session-1",
  ...overrides,
});

const makeNestedPricing = (
  provider: string,
  model: string,
  rates: {
    inputPer1MTokens: number;
    outputPer1MTokens: number;
    cacheReadPer1MTokens?: number;
    cacheWritePer1MTokens?: number;
  },
) => ({
  lastUpdated: "2026-03-09",
  models: { [provider]: { [model]: rates } },
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
      expect(content).toContain("anthropic");
      expect(content).toContain("claude-sonnet-4-6");
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
      expect(content).toContain("claude-sonnet-4-6");
    });
  });

  describe("loadPricing", () => {
    it("loads pricing from pricing.yml with nested provider structure", () => {
      const rootDir = makeTempDir();
      mkdirSync(join(rootDir, ".telesis"), { recursive: true });
      bootstrapPricing(rootDir);

      const pricing = loadPricing(rootDir);

      expect(pricing).not.toBeNull();
      expect(pricing!.models["anthropic"]).toBeDefined();
      expect(pricing!.models["anthropic"]["claude-sonnet-4-6"]).toBeDefined();
      expect(
        pricing!.models["anthropic"]["claude-sonnet-4-6"].inputPer1MTokens,
      ).toBeGreaterThan(0);
    });

    it("returns null when pricing.yml does not exist", () => {
      const rootDir = makeTempDir();
      const pricing = loadPricing(rootDir);
      expect(pricing).toBeNull();
    });

    it("returns null for invalid YAML content", () => {
      const rootDir = makeTempDir();
      const dir = join(rootDir, ".telesis");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "pricing.yml"), "- just a list\n");

      expect(loadPricing(rootDir)).toBeNull();
    });

    it("returns null when lastUpdated is missing", () => {
      const rootDir = makeTempDir();
      const dir = join(rootDir, ".telesis");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "pricing.yml"),
        "models:\n  anthropic:\n    test-model:\n      inputPer1MTokens: 1\n      outputPer1MTokens: 2\n",
      );

      expect(loadPricing(rootDir)).toBeNull();
    });

    it("returns null for malformed YAML syntax", () => {
      const rootDir = makeTempDir();
      const dir = join(rootDir, ".telesis");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "pricing.yml"), "{{bad yaml:\n");

      expect(loadPricing(rootDir)).toBeNull();
    });

    it("skips model entries with negative cache pricing", () => {
      const rootDir = makeTempDir();
      const dir = join(rootDir, ".telesis");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "pricing.yml"),
        [
          'lastUpdated: "2026-03-09"',
          "models:",
          "  test-provider:",
          "    valid-model:",
          "      inputPer1MTokens: 3",
          "      outputPer1MTokens: 15",
          "    neg-cache:",
          "      inputPer1MTokens: 3",
          "      outputPer1MTokens: 15",
          "      cacheWritePer1MTokens: -5",
          "",
        ].join("\n"),
      );

      const pricing = loadPricing(rootDir);
      expect(pricing).not.toBeNull();
      expect(pricing!.models["test-provider"]["valid-model"]).toBeDefined();
      expect(pricing!.models["test-provider"]["neg-cache"]).toBeUndefined();
    });

    it("skips model entries with invalid pricing fields", () => {
      const rootDir = makeTempDir();
      const dir = join(rootDir, ".telesis");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "pricing.yml"),
        [
          'lastUpdated: "2026-03-09"',
          "models:",
          "  test-provider:",
          "    valid-model:",
          "      inputPer1MTokens: 3",
          "      outputPer1MTokens: 15",
          "    bad-model:",
          '      inputPer1MTokens: "not a number"',
          "      outputPer1MTokens: 15",
          "",
        ].join("\n"),
      );

      const pricing = loadPricing(rootDir);
      expect(pricing).not.toBeNull();
      expect(pricing!.models["test-provider"]["valid-model"]).toBeDefined();
      expect(pricing!.models["test-provider"]["bad-model"]).toBeUndefined();
    });

    it("skips providers whose value is not an object", () => {
      const rootDir = makeTempDir();
      const dir = join(rootDir, ".telesis");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "pricing.yml"),
        [
          'lastUpdated: "2026-03-09"',
          "models:",
          "  anthropic:",
          "    claude-sonnet-4-6:",
          "      inputPer1MTokens: 3",
          "      outputPer1MTokens: 15",
          '  bad-provider: "not an object"',
          "",
        ].join("\n"),
      );

      const pricing = loadPricing(rootDir);
      expect(pricing).not.toBeNull();
      expect(pricing!.models["anthropic"]).toBeDefined();
      expect(pricing!.models["bad-provider"]).toBeUndefined();
    });
  });

  describe("calculateCost", () => {
    it("computes cost from token counts and pricing", () => {
      const records = [makeRecord({ inputTokens: 1_000_000, outputTokens: 0 })];
      const pricing = makeNestedPricing("anthropic", "claude-sonnet-4-6", {
        inputPer1MTokens: 3.0,
        outputPer1MTokens: 15.0,
      });

      expect(calculateCost(records, pricing)).toBeCloseTo(3.0);
    });

    it("computes cost for output tokens", () => {
      const records = [makeRecord({ inputTokens: 0, outputTokens: 1_000_000 })];
      const pricing = makeNestedPricing("anthropic", "claude-sonnet-4-6", {
        inputPer1MTokens: 3.0,
        outputPer1MTokens: 15.0,
      });

      expect(calculateCost(records, pricing)).toBeCloseTo(15.0);
    });

    it("sums cost across multiple records", () => {
      const records = [
        makeRecord({ inputTokens: 500_000, outputTokens: 100_000 }),
        makeRecord({ inputTokens: 500_000, outputTokens: 100_000 }),
      ];
      const pricing = makeNestedPricing("anthropic", "claude-sonnet-4-6", {
        inputPer1MTokens: 3.0,
        outputPer1MTokens: 15.0,
      });

      // 1M input * $3/M + 200K output * $15/M = $3 + $3 = $6
      expect(calculateCost(records, pricing)).toBeCloseTo(6.0);
    });

    it("includes cache token costs when present", () => {
      const records = [
        makeRecord({
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 1_000_000,
          cacheWriteTokens: 1_000_000,
        }),
      ];
      const pricing = makeNestedPricing("anthropic", "claude-sonnet-4-6", {
        inputPer1MTokens: 3.0,
        outputPer1MTokens: 15.0,
        cacheReadPer1MTokens: 0.3,
        cacheWritePer1MTokens: 3.75,
      });

      expect(calculateCost(records, pricing)).toBeCloseTo(4.05);
    });

    it("skips records with unknown models", () => {
      const records = [
        makeRecord({ model: "unknown-model", inputTokens: 1_000_000 }),
      ];
      const pricing = makeNestedPricing("anthropic", "claude-sonnet-4-6", {
        inputPer1MTokens: 3.0,
        outputPer1MTokens: 15.0,
      });

      expect(calculateCost(records, pricing)).toBe(0);
    });

    it("skips records whose provider does not match pricing", () => {
      const records = [
        makeRecord({
          provider: "other-provider",
          model: "claude-sonnet-4-6",
          inputTokens: 1_000_000,
        }),
      ];
      const pricing = makeNestedPricing("anthropic", "claude-sonnet-4-6", {
        inputPer1MTokens: 3.0,
        outputPer1MTokens: 15.0,
      });

      expect(calculateCost(records, pricing)).toBe(0);
    });

    it("matches records to correct provider pricing", () => {
      const records = [
        makeRecord({
          provider: "anthropic",
          model: "shared-model",
          inputTokens: 1_000_000,
          outputTokens: 0,
        }),
        makeRecord({
          provider: "other",
          model: "shared-model",
          inputTokens: 1_000_000,
          outputTokens: 0,
        }),
      ];
      const pricing = {
        lastUpdated: "2026-03-09",
        models: {
          anthropic: {
            "shared-model": {
              inputPer1MTokens: 3.0,
              outputPer1MTokens: 15.0,
            },
          },
          other: {
            "shared-model": {
              inputPer1MTokens: 1.0,
              outputPer1MTokens: 5.0,
            },
          },
        },
      };

      // anthropic: 1M * $3 = $3, other: 1M * $1 = $1 → total $4
      expect(calculateCost(records, pricing)).toBeCloseTo(4.0);
    });

    it("returns zero for empty records", () => {
      const pricing = {
        lastUpdated: "2026-03-09",
        models: {},
      };
      expect(calculateCost([], pricing)).toBe(0);
    });
  });

  describe("prototype safety", () => {
    it("does not resolve provider names that collide with Object.prototype", () => {
      const rootDir = makeTempDir();
      const dir = join(rootDir, ".telesis");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "pricing.yml"),
        [
          'lastUpdated: "2026-03-09"',
          "models:",
          "  anthropic:",
          "    claude-sonnet-4-6:",
          "      inputPer1MTokens: 3",
          "      outputPer1MTokens: 15",
          "",
        ].join("\n"),
      );

      const pricing = loadPricing(rootDir)!;
      const records = [
        makeRecord({
          provider: "toString",
          model: "name",
          inputTokens: 1_000_000,
        }),
      ];

      const cost = calculateCost(records, pricing);
      expect(cost).toBe(0);
      expect(Number.isNaN(cost)).toBe(false);
    });
  });
});
