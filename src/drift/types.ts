/** Severity level for a drift finding. */
export type DriftSeverity = "error" | "warning" | "info";

/** A single drift check — a named, self-contained validation rule. */
export interface DriftCheck {
  readonly name: string;
  readonly description: string;
  readonly requiresModel: boolean;
  readonly run: (rootDir: string, ctx?: ScanContext) => DriftFinding;
}

/** Shared scan context providing cached filesystem access across checks. */
export interface ScanContext {
  readonly rootDir: string;
  readonly srcFiles: (exclude?: readonly string[]) => readonly string[];
}

/** The result of running a single drift check. */
export interface DriftFinding {
  readonly check: string;
  readonly passed: boolean;
  readonly message: string;
  readonly severity: DriftSeverity;
  readonly details: readonly string[];
}

/** Summary counts for a drift report. */
export interface DriftSummary {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly warnings: number;
}

/** Aggregated result of running one or more drift checks. */
export interface DriftReport {
  readonly checks: readonly DriftFinding[];
  readonly passed: boolean;
  readonly summary: DriftSummary;
}
