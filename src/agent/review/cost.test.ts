import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deriveCostFromSession } from "./cost.js";
import type { ReviewSession } from "./types.js";

const makeSession = (
  overrides: Partial<ReviewSession> = {},
): ReviewSession => ({
  id: "test-session",
  timestamp: "2026-03-10T00:00:00Z",
  ref: "HEAD~1",
  model: "claude-sonnet-4-6",
  mode: "single",
  findingCount: 0,
  durationMs: 1000,
  tokenUsage: { inputTokens: 100, outputTokens: 50 },
  ...overrides,
});

describe("deriveCostFromSession", () => {
  it("returns correct cost with valid pricing", () => {
    const dir = join(
      tmpdir(),
      `telesis-cost-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(join(dir, ".telesis"), { recursive: true });
    writeFileSync(
      join(dir, ".telesis/pricing.yml"),
      `lastUpdated: "2026-03-10"
models:
  anthropic:
    claude-sonnet-4-6:
      inputPer1MTokens: 3.0
      outputPer1MTokens: 15.0
`,
    );

    const session = makeSession({
      model: "claude-sonnet-4-6",
      tokenUsage: { inputTokens: 10000, outputTokens: 2000 },
    });
    const cost = deriveCostFromSession(session, dir);
    expect(cost).not.toBeNull();
    // 10000 input * $3/1M = $0.03, 2000 output * $15/1M = $0.03
    expect(cost).toBeCloseTo(0.06, 2);
  });

  it("returns null when pricing file missing", () => {
    const dir = join(
      tmpdir(),
      `telesis-cost-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(dir, { recursive: true });
    const session = makeSession();
    const cost = deriveCostFromSession(session, dir);
    expect(cost).toBeNull();
  });
});
