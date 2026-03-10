import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import * as yaml from "js-yaml";
import type { ModelCallRecord } from "./types.js";

export interface ModelPricing {
  readonly inputPer1MTokens: number;
  readonly outputPer1MTokens: number;
  readonly cacheReadPer1MTokens?: number;
  readonly cacheWritePer1MTokens?: number;
}

/** Provider → model → pricing rates. */
export type PricingModels = Readonly<
  Record<string, Readonly<Record<string, ModelPricing>>>
>;

export interface PricingConfig {
  readonly lastUpdated: string;
  readonly models: PricingModels;
}

const PRICING_PATH = ".telesis/pricing.yml";

const DEFAULT_MODELS: PricingConfig["models"] = {
  anthropic: {
    "claude-sonnet-4-6": {
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
  const pricing: PricingConfig = {
    lastUpdated: new Date().toISOString().split("T")[0],
    models: DEFAULT_MODELS,
  };
  const content =
    "# Telesis model pricing — used for cost estimation\n" +
    "# Update manually or via `telesis pricing update` (future)\n" +
    yaml.dump(pricing);

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

const isPlainObject = (val: unknown): val is Record<string, unknown> =>
  !!val && typeof val === "object" && !Array.isArray(val);

const validatePricing = (raw: unknown): PricingConfig | null => {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.lastUpdated !== "string") return null;
  if (!isPlainObject(raw.models)) return null;

  const models: Record<string, Record<string, ModelPricing>> = {};
  for (const [provider, providerModels] of Object.entries(raw.models)) {
    if (!isPlainObject(providerModels)) continue;
    const validModels: Record<string, ModelPricing> = {};
    for (const [model, pricing] of Object.entries(providerModels)) {
      if (isValidModelPricing(pricing)) {
        validModels[model] = pricing;
      }
    }
    if (Object.keys(validModels).length > 0) {
      models[provider] = validModels;
    }
  }

  return { lastUpdated: raw.lastUpdated, models };
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
    const modelPricing = pricing.models[record.provider]?.[record.model];
    if (!modelPricing) return total;
    return total + costForRecord(record, modelPricing);
  }, 0);
