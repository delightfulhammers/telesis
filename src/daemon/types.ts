/** Event source categories */
export type EventSource =
  | "daemon"
  | "filesystem"
  | "socket"
  | "dispatch"
  | "oversight"
  | "intake"
  | "plan";

/** All event type literals */
export type EventType =
  | "daemon:started"
  | "daemon:stopping"
  | "daemon:stopped"
  | "daemon:heartbeat"
  | "fs:file:created"
  | "fs:file:modified"
  | "fs:file:deleted"
  | "fs:dir:created"
  | "fs:dir:deleted"
  | "socket:client:connected"
  | "socket:client:disconnected"
  | "dispatch:session:started"
  | "dispatch:session:completed"
  | "dispatch:session:failed"
  | "dispatch:agent:thinking"
  | "dispatch:agent:tool_call"
  | "dispatch:agent:output"
  | "dispatch:agent:cancelled"
  | "oversight:finding"
  | "oversight:note"
  | "oversight:intervention"
  | "intake:item:imported"
  | "intake:item:approved"
  | "intake:item:dispatched"
  | "intake:item:completed"
  | "intake:item:failed"
  | "intake:item:skipped"
  | "intake:sync:started"
  | "intake:sync:completed"
  | "plan:created"
  | "plan:approved"
  | "plan:executing"
  | "plan:completed"
  | "plan:failed"
  | "plan:task:started"
  | "plan:task:completed"
  | "plan:task:failed";

/** Base event shape — all events extend this */
export interface BaseEvent<T extends EventType, P> {
  readonly type: T;
  readonly timestamp: string;
  readonly source: EventSource;
  readonly payload: P;
}

/** Payload types */
export interface DaemonStartedPayload {
  readonly pid: number;
  readonly rootDir: string;
  readonly version: string;
}

export interface DaemonHeartbeatPayload {
  readonly uptimeMs: number;
  readonly eventCount: number;
}

export interface FsChangePayload {
  readonly path: string;
  readonly absolutePath: string;
}

export interface SocketClientPayload {
  readonly clientId: string;
}

/** Dispatch payload types */
export interface DispatchSessionPayload {
  readonly sessionId: string;
  readonly agent: string;
  readonly task: string;
}

export interface DispatchSessionCompletedPayload extends DispatchSessionPayload {
  readonly durationMs: number;
  readonly eventCount: number;
}

export interface DispatchSessionFailedPayload extends DispatchSessionPayload {
  readonly error: string;
}

export interface DispatchAgentEventPayload {
  readonly sessionId: string;
  readonly agent: string;
  readonly seq: number;
  readonly data: Record<string, unknown>;
}

/** Oversight payload types */
export interface OversightFindingPayload {
  readonly sessionId: string;
  readonly observer: string;
  readonly severity: string;
  readonly summary: string;
}

export interface OversightNotePayload {
  readonly sessionId: string;
  readonly text: string;
  readonly tags: readonly string[];
}

export interface OversightInterventionPayload {
  readonly sessionId: string;
  readonly observer: string;
  readonly reason: string;
}

/** Intake payload types */
export interface IntakeItemPayload {
  readonly itemId: string;
  readonly source: string;
  readonly sourceId: string;
  readonly title: string;
}

export interface IntakeSyncPayload {
  readonly source: string;
  readonly imported: number;
  readonly skippedDuplicate: number;
}

/** Plan payload types */
export interface PlanEventPayload {
  readonly planId: string;
  readonly workItemId: string;
  readonly title: string;
}

export interface PlanTaskEventPayload {
  readonly planId: string;
  readonly taskId: string;
  readonly title: string;
}

/** Full discriminated union of all daemon events */
export type TelesisDaemonEvent =
  | BaseEvent<"daemon:started", DaemonStartedPayload>
  | BaseEvent<"daemon:stopping", Record<string, never>>
  | BaseEvent<"daemon:stopped", Record<string, never>>
  | BaseEvent<"daemon:heartbeat", DaemonHeartbeatPayload>
  | BaseEvent<"fs:file:created", FsChangePayload>
  | BaseEvent<"fs:file:modified", FsChangePayload>
  | BaseEvent<"fs:file:deleted", FsChangePayload>
  | BaseEvent<"fs:dir:created", FsChangePayload>
  | BaseEvent<"fs:dir:deleted", FsChangePayload>
  | BaseEvent<"socket:client:connected", SocketClientPayload>
  | BaseEvent<"socket:client:disconnected", SocketClientPayload>
  | BaseEvent<"dispatch:session:started", DispatchSessionPayload>
  | BaseEvent<"dispatch:session:completed", DispatchSessionCompletedPayload>
  | BaseEvent<"dispatch:session:failed", DispatchSessionFailedPayload>
  | BaseEvent<"dispatch:agent:thinking", DispatchAgentEventPayload>
  | BaseEvent<"dispatch:agent:tool_call", DispatchAgentEventPayload>
  | BaseEvent<"dispatch:agent:output", DispatchAgentEventPayload>
  | BaseEvent<"dispatch:agent:cancelled", DispatchAgentEventPayload>
  | BaseEvent<"oversight:finding", OversightFindingPayload>
  | BaseEvent<"oversight:note", OversightNotePayload>
  | BaseEvent<"oversight:intervention", OversightInterventionPayload>
  | BaseEvent<"intake:item:imported", IntakeItemPayload>
  | BaseEvent<"intake:item:approved", IntakeItemPayload>
  | BaseEvent<"intake:item:dispatched", IntakeItemPayload>
  | BaseEvent<"intake:item:completed", IntakeItemPayload>
  | BaseEvent<"intake:item:failed", IntakeItemPayload>
  | BaseEvent<"intake:item:skipped", IntakeItemPayload>
  | BaseEvent<"intake:sync:started", IntakeSyncPayload>
  | BaseEvent<"intake:sync:completed", IntakeSyncPayload>
  | BaseEvent<"plan:created", PlanEventPayload>
  | BaseEvent<"plan:approved", PlanEventPayload>
  | BaseEvent<"plan:executing", PlanEventPayload>
  | BaseEvent<"plan:completed", PlanEventPayload>
  | BaseEvent<"plan:failed", PlanEventPayload>
  | BaseEvent<"plan:task:started", PlanTaskEventPayload>
  | BaseEvent<"plan:task:completed", PlanTaskEventPayload>
  | BaseEvent<"plan:task:failed", PlanTaskEventPayload>;

/** Map from EventType to the event source it belongs to */
const EVENT_SOURCE_MAP: Record<EventType, EventSource> = {
  "daemon:started": "daemon",
  "daemon:stopping": "daemon",
  "daemon:stopped": "daemon",
  "daemon:heartbeat": "daemon",
  "fs:file:created": "filesystem",
  "fs:file:modified": "filesystem",
  "fs:file:deleted": "filesystem",
  "fs:dir:created": "filesystem",
  "fs:dir:deleted": "filesystem",
  "socket:client:connected": "socket",
  "socket:client:disconnected": "socket",
  "dispatch:session:started": "dispatch",
  "dispatch:session:completed": "dispatch",
  "dispatch:session:failed": "dispatch",
  "dispatch:agent:thinking": "dispatch",
  "dispatch:agent:tool_call": "dispatch",
  "dispatch:agent:output": "dispatch",
  "dispatch:agent:cancelled": "dispatch",
  "oversight:finding": "oversight",
  "oversight:note": "oversight",
  "oversight:intervention": "oversight",
  "intake:item:imported": "intake",
  "intake:item:approved": "intake",
  "intake:item:dispatched": "intake",
  "intake:item:completed": "intake",
  "intake:item:failed": "intake",
  "intake:item:skipped": "intake",
  "intake:sync:started": "intake",
  "intake:sync:completed": "intake",
  "plan:created": "plan",
  "plan:approved": "plan",
  "plan:executing": "plan",
  "plan:completed": "plan",
  "plan:failed": "plan",
  "plan:task:started": "plan",
  "plan:task:completed": "plan",
  "plan:task:failed": "plan",
};

/** Factory for creating typed events with automatic timestamp and source */
export const createEvent = <T extends EventType>(
  type: T,
  payload: Extract<TelesisDaemonEvent, { readonly type: T }>["payload"],
): Extract<TelesisDaemonEvent, { readonly type: T }> =>
  ({
    type,
    timestamp: new Date().toISOString(),
    source: EVENT_SOURCE_MAP[type],
    payload,
  }) as Extract<TelesisDaemonEvent, { readonly type: T }>;

/** Socket protocol — Client → Server */
export interface SocketRequest {
  readonly id: string;
  readonly command: "stop" | "status" | "subscribe" | "unsubscribe" | "ping";
}

/** Socket protocol — Server → Client (response to request) */
export interface SocketResponse {
  readonly id: string;
  readonly ok: boolean;
  readonly data?: unknown;
  readonly error?: string;
}

/** Socket protocol — Server → Subscribers (broadcast event) */
export interface SocketBroadcast {
  readonly broadcast: true;
  readonly event: TelesisDaemonEvent;
}

/** Any message a client may receive */
export type SocketMessage = SocketResponse | SocketBroadcast;

/** Daemon configuration (parsed from .telesis/config.yml) */
export interface DaemonConfig {
  readonly watch?: {
    readonly ignore?: readonly string[];
  };
  readonly heartbeatIntervalMs?: number;
}

/** Maximum message size over the socket (bytes) */
export const MAX_SOCKET_MESSAGE_SIZE = 64 * 1024;

/** Default heartbeat interval (ms) */
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;

/** Default ignore patterns for filesystem watcher */
export const DEFAULT_IGNORE_PATTERNS: readonly string[] = [
  ".telesis/",
  "node_modules/",
  ".git/",
  "dist/",
  "build/",
  ".next/",
];
