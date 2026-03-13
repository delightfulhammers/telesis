/** Agent name — any acpx-supported agent (claude, codex, gemini, etc.) */
export type AgentName = string;

/** Session lifecycle status */
export type SessionStatus = "running" | "completed" | "failed" | "cancelled";

/** A single event from an acpx agent session (NDJSON line) */
export interface AgentEvent {
  readonly eventVersion: number;
  readonly sessionId: string;
  readonly requestId: string;
  readonly seq: number;
  readonly stream: string;
  readonly type: string;
  readonly [key: string]: unknown;
}

/** Metadata for a dispatch session (random-access, updated on status changes) */
export interface SessionMeta {
  readonly id: string;
  readonly agent: string;
  readonly task: string;
  readonly status: SessionStatus;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly error?: string;
  readonly eventCount: number;
}
