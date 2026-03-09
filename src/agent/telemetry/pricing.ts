import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import * as yaml from "js-yaml";
import type { ModelCallRecord } from "./types.js";

export interface ModelPricing {
  readonly provider: string;
  readonly inputPer1MTokens: number;
  readonly outputPer1MTokens: number;
  readonly cacheReadPer1MTokens?: number;
  readonly cacheWritePer1MTokens?: number;
}

export interface PricingConfig {
  readonly lastUpdated: string;
  readonly models: Readonly<Record<string, ModelPricing>>;
}

const PRICING_PATH = ".telesis/pricing.yml";

const DEFAULT_PRICING: PricingConfig = {
  lastUpdated: new Date().toISOString().split("T")[0],
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

export const bootstrapPricing = (rootDir: string): void => {
  const pricingPath = join(rootDir, PRICING_PATH);
  if (existsSync(pricingPath)) return;

  mkdirSync(join(rootDir, ".telesis"), { recursive: true });
  const content =
    "# Telesis model pricing — used for cost estimation\n" +
    "# Update manually or via `telesis pricing update` (future)\n" +
    yaml.dump(DEFAULT_PRICING);
  writeFileSync(pricingPath, content);
};

export const loadPricing = (rootDir: string): PricingConfig | null => {
  const pricingPath = join(rootDir, PRICING_PATH);
  if (!existsSync(pricingPath)) return null;

  const raw = yaml.load(readFileSync(pricingPath, "utf-8")) as Record<
    string,
    unknown
  >;
  return raw as unknown as PricingConfig;
};

const costForRecord = (
  record: ModelCallRecord,
  modelPricing: ModelPricing,
): number => {
  const inputCost =
    (record.inputTokens / 1_000_000) * modelPricing.inputPer1MTokens;
  const outputCost =
    (record.outputTokens / 1_000_000) * modelPricing.outputPer1MTokens;
  const cacheReadCost =
    ((record.cacheReadTokens ?? 0) / 1_000_000) *
    (modelPricing.cacheReadPer1MTokens ?? 0);
  const cacheWriteCost =
    ((record.cacheWriteTokens ?? 0) / 1_000_000) *
    (modelPricing.cacheWritePer1MTokens ?? 0);

  return inputCost + outputCost + cacheReadCost + cacheWriteCost;
};

export const calculateCost = (
  records: readonly ModelCallRecord[],
  pricing: PricingConfig,
): number =>
  records.reduce((total, record) => {
    const modelPricing = pricing.models[record.model];
    if (!modelPricing) return total;
    return total + costForRecord(record, modelPricing);
  }, 0);
