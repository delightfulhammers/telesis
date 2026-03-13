import type { TelesisDaemonEvent, EventType } from "./types.js";

/** ANSI color codes */
const COLORS = {
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  boldRed: "\x1b[1;31m",
  dim: "\x1b[2m",
  reset: "\x1b[0m",
} as const;

/** Get the color for an event type */
const colorForType = (type: EventType): string => {
  if (type.startsWith("fs:")) return COLORS.cyan;
  if (type.startsWith("daemon:")) return COLORS.green;
  if (type.startsWith("socket:")) return COLORS.dim;
  if (type.startsWith("dispatch:session:")) return COLORS.magenta;
  if (type.startsWith("dispatch:agent:")) return COLORS.yellow;
  if (type === "oversight:intervention") return COLORS.boldRed;
  if (type === "oversight:finding") return COLORS.red;
  if (type === "oversight:note") return COLORS.green;
  if (type.startsWith("intake:")) return COLORS.cyan;
  return COLORS.reset;
};

/** Format a timestamp to HH:MM:SS.mmm */
const formatTime = (isoTimestamp: string): string => {
  const date = new Date(isoTimestamp);
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
};

/** Format the payload summary for an event */
const formatPayload = (event: TelesisDaemonEvent): string => {
  switch (event.type) {
    case "fs:file:created":
    case "fs:file:modified":
    case "fs:file:deleted":
    case "fs:dir:created":
    case "fs:dir:deleted":
      return event.payload.path;

    case "daemon:started":
      return `pid=${event.payload.pid} v${event.payload.version}`;

    case "daemon:heartbeat":
      return `uptime=${Math.floor(event.payload.uptimeMs / 1000)}s events=${event.payload.eventCount}`;

    case "daemon:stopping":
    case "daemon:stopped":
      return "";

    case "socket:client:connected":
    case "socket:client:disconnected":
      return event.payload.clientId.slice(0, 8);

    case "dispatch:session:started":
      return `agent=${event.payload.agent} task="${truncate(event.payload.task, 40)}"`;

    case "dispatch:session:completed":
      return `duration=${Math.floor(event.payload.durationMs / 1000)}s events=${event.payload.eventCount}`;

    case "dispatch:session:failed":
      return `error="${truncate(event.payload.error, 60)}"`;

    case "dispatch:agent:thinking":
    case "dispatch:agent:tool_call":
    case "dispatch:agent:output":
    case "dispatch:agent:cancelled":
      return `seq=${event.payload.seq}${formatAgentData(event.payload.data)}`;

    case "oversight:finding":
      return `observer=${event.payload.observer} severity=${event.payload.severity} summary="${truncate(event.payload.summary, 60)}"`;

    case "oversight:note":
      return `tags=${event.payload.tags.join(",")} text="${truncate(event.payload.text, 60)}"`;

    case "oversight:intervention":
      return `observer=${event.payload.observer} reason="${truncate(event.payload.reason, 60)}"`;

    case "intake:item:imported":
    case "intake:item:approved":
    case "intake:item:dispatched":
    case "intake:item:completed":
    case "intake:item:failed":
    case "intake:item:skipped":
      return `${event.payload.source}#${event.payload.sourceId} "${truncate(event.payload.title, 50)}"`;

    case "intake:sync:started":
      return `source=${event.payload.source}`;

    case "intake:sync:completed":
      return `source=${event.payload.source} imported=${event.payload.imported} skipped=${event.payload.skippedDuplicate}`;

    default:
      return "";
  }
};

/** Truncate a string with ellipsis */
const truncate = (text: string, maxLen: number): string =>
  text.length > maxLen ? text.slice(0, maxLen - 1) + "…" : text;

/** Format agent event data into a key=value suffix */
const formatAgentData = (data: Record<string, unknown>): string => {
  const tool = data.tool;
  if (typeof tool === "string") return ` tool=${tool}`;
  return "";
};

/** Format an event as a single colored log line */
export const formatEventLine = (event: TelesisDaemonEvent): string => {
  const time = formatTime(event.timestamp);
  const color = colorForType(event.type);
  const payload = formatPayload(event);
  const suffix = payload ? `  ${payload}` : "";

  return `${COLORS.dim}${time}${COLORS.reset}  ${color}${event.type}${COLORS.reset}${suffix}`;
};

/** Render events to stdout — returns a handler function for use with client.onEvent */
export const createEventRenderer =
  (): ((event: TelesisDaemonEvent) => void) => (event) => {
    console.log(formatEventLine(event));
  };
