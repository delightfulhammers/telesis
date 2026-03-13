/** Valid work item statuses — used for runtime validation */
export const WORK_ITEM_STATUSES = [
  "pending",
  "approved",
  "dispatching",
  "completed",
  "failed",
  "skipped",
] as const;

/** Status lifecycle for a work item */
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

/** Supported intake source kinds — extensible for future adapters */
export type IntakeSourceKind = "github";

/** Canonical internal representation of a unit of work from any source */
export interface WorkItem {
  readonly id: string;
  readonly source: IntakeSourceKind;
  readonly sourceId: string;
  readonly sourceUrl: string;
  readonly title: string;
  readonly body: string;
  readonly labels: readonly string[];
  readonly assignee?: string;
  readonly priority?: string;
  readonly status: WorkItemStatus;
  readonly importedAt: string;
  readonly approvedAt?: string;
  readonly dispatchedAt?: string;
  readonly completedAt?: string;
  readonly sessionId?: string;
  readonly error?: string;
}

/** Result of a sync operation from an intake source */
export interface IntakeSyncResult {
  readonly imported: number;
  readonly skippedDuplicate: number;
  readonly errors: readonly string[];
}
