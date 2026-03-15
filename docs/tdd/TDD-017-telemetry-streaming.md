# TDD-017 — Telemetry Streaming

**Status:** Draft
**Date:** 2026-03-16
**Author:** Delightful Hammers
**Related:** v0.24.0 milestone, GitHub issue #36

---

## Overview

The telemetry reader (`src/agent/telemetry/reader.ts`) currently loads the entire
`.telesis/telemetry.jsonl` file into memory via `readFileSync`, then parses every line.
For projects with months of model call history, this file can grow to tens of thousands of
records (each ~200 bytes), creating unnecessary memory pressure and startup latency for
commands like `telesis status` that only need aggregate totals.

### What this TDD addresses

- A streaming telemetry reader that processes records line-by-line using `createReadStream`
- A reducer-based API for computing aggregates (token totals, cost, call count) without
  materializing the full record array
- Migration of `getStatus()` and cost derivation to use the streaming API
- Retention of the batch `loadTelemetryRecords` for callers that need the full record set

### What this TDD does not address (scope boundary)

- Telemetry file rotation or archival
- Compression of old telemetry records
- Database-backed telemetry storage
- Changes to the telemetry write path (`logger.ts`)
- Changes to the `ModelCallRecord` schema

---

## Architecture

### Current (batch)

```
loadTelemetryRecords(rootDir)
  → readFileSync(telemetry.jsonl)     // entire file into memory
  → split("\n") → JSON.parse each    // full array materialized
  → return { records, invalidLineCount }
```

### Proposed (streaming)

```
reduceTelemetry(rootDir, reducer, initial)
  → createReadStream(telemetry.jsonl)  // node:fs stream
  → readline interface                // line-by-line
  → JSON.parse + validate each        // one record at a time
  → reducer(accumulator, record)       // fold into result
  → return accumulator

// Pre-built reducers:
tokenTotalsReducer    → { inputTokens, outputTokens, callCount }
costReducer(pricing)  → { estimatedCost }
```

### Files affected

| File | Change |
|------|--------|
| `src/agent/telemetry/reader.ts` | Add `reduceTelemetry()` streaming function |
| `src/status/status.ts` | Migrate from `loadTelemetryRecords` to `reduceTelemetry` |
| `src/agent/telemetry/pricing.ts` | Adapt `calculateCost` to work with streaming or accept pre-aggregated data |

---

## Types

```typescript
/** Reducer function for streaming telemetry processing */
export type TelemetryReducer<T> = (accumulator: T, record: ModelCallRecord) => T;

/** Result of streaming reduction including invalid line count */
export interface ReduceTelemetryResult<T> {
  readonly result: T;
  readonly invalidLineCount: number;
}

/** Pre-built: token totals accumulator */
export interface TokenTotals {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly callCount: number;
}
```

---

## Key Design Decisions

### 1. Reducer pattern, not AsyncIterable

A reducer fold (`reduce(acc, record) → acc`) is simpler than exposing an async iterator.
The caller doesn't need to manage iteration — they provide a reducer and get back the
result. This matches how telemetry is actually used: every caller aggregates.

### 2. Batch reader retained

`loadTelemetryRecords` stays as-is for callers that genuinely need the full record array
(e.g., future analytics or export features). The streaming reader is additive.

### 3. readline over manual chunking

Node's `readline.createInterface` with `createReadStream` handles line splitting correctly
for any line ending. No need to manually manage buffer boundaries.

---

## Test Strategy

- Unit tests for `reduceTelemetry` with small in-memory JSONL files in temp dirs
- Test with empty file, single record, malformed lines, mixed valid/invalid
- Test that `tokenTotalsReducer` produces identical results to batch loading + manual sum
- Test that `getStatus()` returns identical results before and after migration
- Performance test (optional, manual): generate a 50k-record JSONL file, compare batch vs
  streaming memory and time
