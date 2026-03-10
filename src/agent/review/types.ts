import type { TokenUsage } from "../model/types.js";

// --- Diff Resolver ---

export interface ChangedFile {
  readonly path: string;
  readonly status: "added" | "modified" | "deleted" | "renamed";
}

export interface ResolvedDiff {
  readonly diff: string;
  readonly files: readonly ChangedFile[];
  readonly ref: string;
}

// --- Review Findings ---

export const SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type Severity = (typeof SEVERITIES)[number];

export type Category =
  | "bug"
  | "security"
  | "architecture"
  | "maintainability"
  | "performance"
  | "style";

export interface ReviewFinding {
  readonly id: string;
  readonly sessionId: string;
  readonly severity: Severity;
  readonly category: Category;
  readonly path: string;
  readonly startLine?: number;
  readonly endLine?: number;
  readonly description: string;
  readonly suggestion: string;
}

// --- Review Session ---

export interface ReviewSession {
  readonly id: string;
  readonly timestamp: string;
  readonly ref: string;
  readonly files: readonly ChangedFile[];
  readonly findingCount: number;
  readonly model: string;
  readonly durationMs: number;
  readonly tokenUsage: TokenUsage;
}

// --- Review Context ---

export interface ReviewContext {
  readonly conventions: string;
  readonly projectName: string;
  readonly primaryLanguage: string;
}
