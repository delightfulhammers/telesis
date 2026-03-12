/** Event source categories */
export type EventSource = "daemon" | "filesystem" | "socket";

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
  | "socket:client:disconnected";

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
  | BaseEvent<"socket:client:disconnected", SocketClientPayload>;

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
