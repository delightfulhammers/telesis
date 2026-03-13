import type { IntakeSourceKind } from "./types.js";

/** A raw issue fetched from an external source, before normalization to WorkItem */
export interface RawIssue {
  readonly sourceId: string;
  readonly sourceUrl: string;
  readonly title: string;
  readonly body: string;
  readonly labels: readonly string[];
  readonly assignee?: string;
  readonly priority?: string;
}

/** Adapter interface for external work sources */
export interface IntakeSource {
  readonly kind: IntakeSourceKind;
  readonly fetchIssues: () => Promise<readonly RawIssue[]>;
}
