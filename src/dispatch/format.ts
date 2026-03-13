import type { SessionMeta, AgentEvent } from "./types.js";
import { formatEventLine } from "../daemon/tui.js";
import { createEvent } from "../daemon/types.js";

/** Format a list of sessions as a table */
export const formatSessionList = (sessions: readonly SessionMeta[]): string => {
  if (sessions.length === 0) return "No dispatch sessions.";

  const lines = sessions.map((s) => {
    const id = s.id.slice(0, 8);
    const status = padRight(s.status, 10);
    const agent = padRight(s.agent, 10);
    const date = s.startedAt.slice(0, 19).replace("T", " ");
    const task = truncate(s.task, 50);
    return `${id}  ${status}  ${agent}  ${date}  ${task}`;
  });

  const header = `${"ID".padEnd(8)}  ${"STATUS".padEnd(10)}  ${"AGENT".padEnd(10)}  ${"STARTED".padEnd(19)}  TASK`;
  return [header, ...lines].join("\n");
};

/** Format a session's event log for replay display */
export const formatSessionDetail = (
  meta: SessionMeta,
  events: readonly AgentEvent[],
): string => {
  const header = [
    `Session: ${meta.id}`,
    `Agent:   ${meta.agent}`,
    `Task:    ${meta.task}`,
    `Status:  ${meta.status}`,
    `Started: ${meta.startedAt}`,
    meta.completedAt ? `Ended:   ${meta.completedAt}` : null,
    meta.error ? `Error:   ${meta.error}` : null,
    `Events:  ${meta.eventCount}`,
    "",
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  if (events.length === 0) return header + "No events recorded.";

  const eventLines = events.map((e) => {
    const daemonEvent = createEvent(translateType(e.type), {
      sessionId: meta.id,
      agent: meta.agent,
      seq: e.seq,
      data: extractData(e),
    });
    return formatEventLine(daemonEvent);
  });

  return header + eventLines.join("\n");
};

/** Translate acpx event type to daemon dispatch event type */
const translateType = (
  acpxType: string,
):
  | "dispatch:agent:thinking"
  | "dispatch:agent:tool_call"
  | "dispatch:agent:output"
  | "dispatch:agent:cancelled" => {
  switch (acpxType) {
    case "thinking":
      return "dispatch:agent:thinking";
    case "tool_call":
      return "dispatch:agent:tool_call";
    case "cancelled":
      return "dispatch:agent:cancelled";
    default:
      return "dispatch:agent:output";
  }
};

/** Extract display data from an agent event */
const extractData = (event: AgentEvent): Record<string, unknown> => {
  const {
    eventVersion: _,
    sessionId: _s,
    requestId: _r,
    seq: _q,
    stream: _st,
    type: _t,
    ...rest
  } = event;
  return rest;
};

const padRight = (s: string, len: number): string =>
  s.length >= len ? s : s + " ".repeat(len - s.length);

const truncate = (text: string, maxLen: number): string =>
  text.length > maxLen ? text.slice(0, maxLen - 1) + "…" : text;
