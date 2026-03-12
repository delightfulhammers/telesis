import type { TelesisDaemonEvent, EventType } from "./types.js";

/** ANSI color codes */
const COLORS = {
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  dim: "\x1b[2m",
  reset: "\x1b[0m",
} as const;

/** Get the color for an event type */
const colorForType = (type: EventType): string => {
  if (type.startsWith("fs:")) return COLORS.cyan;
  if (type.startsWith("daemon:")) return COLORS.green;
  if (type.startsWith("socket:")) return COLORS.dim;
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

    default:
      return "";
  }
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
