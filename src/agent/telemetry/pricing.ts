import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
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
  const resolvedRoot = resolve(rootDir);
  const pricingPath = join(resolvedRoot, PRICING_PATH);

  mkdirSync(join(resolvedRoot, ".telesis"), { recursive: true });
  const content =
    "# Telesis model pricing — used for cost estimation\n" +
    "# Update manually or via `telesis pricing update` (future)\n" +
    yaml.dump(DEFAULT_PRICING);

  try {
    writeFileSync(pricingPath, content, { flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") return;
    throw err;
  }
};

const isValidModelPricing = (val: unknown): val is ModelPricing => {
  if (!val || typeof val !== "object") return false;
  const obj = val as Record<string, unknown>;
  if (typeof obj.provider !== "string") return false;
  if (typeof obj.inputPer1MTokens !== "number" || obj.inputPer1MTokens < 0)
    return false;
  if (typeof obj.outputPer1MTokens !== "number" || obj.outputPer1MTokens < 0)
    return false;
  if (
    typeof obj.cacheReadPer1MTokens === "number" &&
    obj.cacheReadPer1MTokens < 0
  )
    return false;
  if (
    typeof obj.cacheWritePer1MTokens === "number" &&
    obj.cacheWritePer1MTokens < 0
  )
    return false;
  return true;
};

const validatePricing = (raw: unknown): PricingConfig | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  if (typeof obj.lastUpdated !== "string") return null;
  if (
    !obj.models ||
    typeof obj.models !== "object" ||
    Array.isArray(obj.models)
  )
    return null;

  const models: Record<string, ModelPricing> = {};
  for (const [key, val] of Object.entries(
    obj.models as Record<string, unknown>,
  )) {
    if (isValidModelPricing(val)) {
      models[key] = val;
    }
  }

  return { lastUpdated: obj.lastUpdated, models };
};

export const loadPricing = (rootDir: string): PricingConfig | null => {
  const resolvedRoot = resolve(rootDir);
  const pricingPath = join(resolvedRoot, PRICING_PATH);

  let data: string;
  try {
    data = readFileSync(pricingPath, "utf-8");
  } catch {
    return null;
  }

  let raw: unknown;
  try {
    raw = yaml.load(data, { schema: yaml.JSON_SCHEMA });
  } catch {
    return null;
  }
  return validatePricing(raw);
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
