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

export const CATEGORIES = [
  "bug",
  "security",
  "architecture",
  "maintainability",
  "performance",
  "style",
] as const;

export type Category = (typeof CATEGORIES)[number];

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
  readonly confidence?: number; // 0-100, self-assessed by model
  readonly persona?: string;
  readonly dedupGroupId?: string;
}

// --- Confidence Thresholds ---

export interface ConfidenceThresholds {
  readonly critical: number; // default: 50
  readonly high: number; // default: 60
  readonly medium: number; // default: 70
  readonly low: number; // default: 80
}

export const DEFAULT_CONFIDENCE_THRESHOLDS: ConfidenceThresholds = {
  critical: 50,
  high: 60,
  medium: 70,
  low: 80,
};

// --- Review Session ---

export type ReviewMode = "single" | "personas";

export interface ReviewSession {
  readonly id: string;
  readonly timestamp: string;
  readonly ref: string;
  readonly files: readonly ChangedFile[];
  readonly findingCount: number;
  readonly model: string;
  readonly durationMs: number;
  readonly tokenUsage: TokenUsage;
  readonly mode: ReviewMode;
  readonly personas?: readonly string[];
  readonly themes?: readonly string[];
}

// --- Review Context ---

export interface ReviewContext {
  readonly conventions: string;
  readonly projectName: string;
  readonly primaryLanguage: string;
  readonly conventionsTruncated?: {
    readonly originalLength: number;
    readonly truncatedLength: number;
  };
}

// --- Persona Definitions ---

export interface PersonaDefinition {
  readonly slug: string;
  readonly name: string;
  readonly preamble: string;
  readonly focusCategories: readonly Category[];
  readonly ignoreCategories: readonly Category[];
  readonly model?: string;
}

// --- Persona Results ---

export interface PersonaResult {
  readonly persona: string;
  readonly findings: readonly ReviewFinding[];
  readonly tokenUsage: TokenUsage;
  readonly durationMs: number;
}

export interface DedupResult {
  readonly findings: readonly ReviewFinding[];
  readonly mergedCount: number;
  readonly tokenUsage?: TokenUsage;
}

// --- Theme Conclusions ---

export interface ThemeConclusion {
  readonly theme: string; // "redirect prevention in fetch calls"
  readonly conclusion: string; // "All fetch calls use redirect: 'error' intentionally"
  readonly antiPattern: string; // "Do not suggest removing redirect: 'error'"
}

// --- Finding Utilities ---

/**
 * Formats a finding's file location as a compact string.
 * Shared across prompts, verification, and GitHub formatting.
 */
export const formatFindingLocation = (finding: {
  readonly path: string;
  readonly startLine?: number;
  readonly endLine?: number;
}): string => {
  if (finding.startLine !== undefined) {
    return finding.endLine !== undefined &&
      finding.endLine !== finding.startLine
      ? `${finding.path}:${finding.startLine}-${finding.endLine}`
      : `${finding.path}:${finding.startLine}`;
  }
  return finding.path;
};

// --- Verification ---

export interface VerificationEntry {
  readonly index: number;
  readonly verified: boolean;
  readonly confidence: number; // 0-100, independently assessed by verifier
  readonly evidence: string;
}

export interface VerificationResult {
  readonly findings: readonly ReviewFinding[];
  readonly filteredCount: number;
  readonly tokenUsage?: TokenUsage;
  readonly durationMs?: number;
}

export interface FilterStats {
  readonly dismissalFilteredCount: number;
  readonly noiseFilteredCount: number;
  readonly antiPatternFilteredCount: number;
  readonly totalFilteredCount: number;
}
