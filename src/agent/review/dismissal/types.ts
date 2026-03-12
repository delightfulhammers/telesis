import type { Severity, Category } from "../types.js";

export const DISMISSAL_REASONS = [
  "false-positive",
  "not-actionable",
  "already-addressed",
  "style-preference",
] as const;

export type DismissalReason = (typeof DISMISSAL_REASONS)[number];

export type DismissalSource =
  | "cli"
  | "github"
  | "gitlab"
  | "gitea"
  | "bitbucket";

export interface Dismissal {
  readonly id: string;
  readonly findingId: string;
  readonly sessionId: string;
  readonly reason: DismissalReason;
  readonly timestamp: string; // ISO 8601
  readonly source: DismissalSource;
  readonly path: string;
  readonly severity: Severity;
  readonly category: Category;
  readonly description: string;
  readonly suggestion: string;
  readonly persona?: string;
  readonly note?: string;
}

export const isValidDismissalReason = (s: string): s is DismissalReason =>
  (DISMISSAL_REASONS as readonly string[]).includes(s);
