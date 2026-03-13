import { randomUUID } from "node:crypto";
import type { AgentAdapter } from "./adapter.js";
import type { AgentEvent, SessionMeta, SessionStatus } from "./types.js";
import { createSession, appendEvent, updateSessionMeta } from "./store.js";
import { assembleDispatchContext, formatContextPrompt } from "./context.js";
import type { TelesisDaemonEvent } from "../daemon/types.js";
import { createEvent } from "../daemon/types.js";

/** Dependencies injected into the dispatcher */
export interface DispatchDeps {
  readonly rootDir: string;
  readonly adapter: AgentAdapter;
  readonly onEvent?: (event: TelesisDaemonEvent) => void;
  readonly maxConcurrent?: number;
}

/** Result of a completed dispatch */
export interface DispatchResult {
  readonly sessionId: string;
  readonly status: SessionStatus;
  readonly eventCount: number;
  readonly durationMs: number;
}

const DEFAULT_MAX_CONCURRENT = 3;

/** Module-level tracking of active sessions for concurrency enforcement */
const activeSessions = new Set<string>();

/** Dispatch a task to a coding agent */
export const dispatch = async (
  deps: DispatchDeps,
  agent: string,
  task: string,
): Promise<DispatchResult> => {
  const maxConcurrent = deps.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;

  if (activeSessions.size >= maxConcurrent) {
    throw new Error(
      `max concurrent agents reached (${maxConcurrent}). Wait for a session to complete or increase dispatch.maxConcurrent in config.`,
    );
  }

  const sessionId = randomUUID();
  activeSessions.add(sessionId);
  const startTime = Date.now();
  let eventCount = 0;

  const meta: SessionMeta = {
    id: sessionId,
    agent,
    task,
    status: "running",
    startedAt: new Date().toISOString(),
    eventCount: 0,
  };

  createSession(deps.rootDir, meta);

  // Emit session started event
  deps.onEvent?.(
    createEvent("dispatch:session:started", {
      sessionId,
      agent,
      task,
    }),
  );

  // Assemble project context
  const ctx = assembleDispatchContext(deps.rootDir);
  const contextPrefix = formatContextPrompt(ctx);
  const fullPrompt = contextPrefix + "\n\n---\n\n" + task;

  const onAgentEvent = (event: AgentEvent): void => {
    eventCount++;

    // Persist to session JSONL
    appendEvent(deps.rootDir, sessionId, event);

    // Translate to daemon event and publish
    const daemonEventType = translateEventType(event.type);
    if (daemonEventType && deps.onEvent) {
      deps.onEvent(
        createEvent(daemonEventType, {
          sessionId,
          agent,
          seq: event.seq,
          data: extractEventData(event),
        }),
      );
    }
  };

  try {
    await deps.adapter.createSession(agent, sessionId, deps.rootDir);
    await deps.adapter.prompt(
      agent,
      sessionId,
      fullPrompt,
      deps.rootDir,
      onAgentEvent,
    );

    const durationMs = Date.now() - startTime;
    const completedMeta: SessionMeta = {
      ...meta,
      status: "completed",
      completedAt: new Date().toISOString(),
      eventCount,
    };
    updateSessionMeta(deps.rootDir, completedMeta);

    deps.onEvent?.(
      createEvent("dispatch:session:completed", {
        sessionId,
        agent,
        task,
        durationMs,
        eventCount,
      }),
    );

    return { sessionId, status: "completed", eventCount, durationMs };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : "unknown error";

    const failedMeta: SessionMeta = {
      ...meta,
      status: "failed",
      completedAt: new Date().toISOString(),
      error: errorMessage,
      eventCount,
    };
    updateSessionMeta(deps.rootDir, failedMeta);

    deps.onEvent?.(
      createEvent("dispatch:session:failed", {
        sessionId,
        agent,
        task,
        error: errorMessage,
      }),
    );

    return { sessionId, status: "failed", eventCount, durationMs };
  } finally {
    activeSessions.delete(sessionId);
  }
};

/** Map acpx event types to daemon dispatch event types */
const translateEventType = (
  acpxType: string,
):
  | "dispatch:agent:thinking"
  | "dispatch:agent:tool_call"
  | "dispatch:agent:output"
  | "dispatch:agent:cancelled"
  | null => {
  switch (acpxType) {
    case "thinking":
      return "dispatch:agent:thinking";
    case "tool_call":
      return "dispatch:agent:tool_call";
    case "output":
    case "diffs":
      return "dispatch:agent:output";
    case "cancelled":
      return "dispatch:agent:cancelled";
    default:
      return null;
  }
};

/** Extract display-relevant data from an agent event */
const extractEventData = (event: AgentEvent): Record<string, unknown> => {
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

/** Get the count of currently active sessions (for testing) */
export const getActiveSessionCount = (): number => activeSessions.size;

/** Clear active sessions (for testing cleanup) */
export const clearActiveSessions = (): void => activeSessions.clear();
