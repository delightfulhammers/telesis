import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";
import type { AgentEvent, SessionMeta } from "./types.js";

const SESSIONS_DIR = ".telesis/sessions";

const sessionsDir = (rootDir: string): string =>
  join(resolve(rootDir), SESSIONS_DIR);

const metaPath = (rootDir: string, sessionId: string): string =>
  join(sessionsDir(rootDir), `${sessionId}.meta.json`);

const eventsPath = (rootDir: string, sessionId: string): string =>
  join(sessionsDir(rootDir), `${sessionId}.events.jsonl`);

const isValidSessionMeta = (val: unknown): val is SessionMeta => {
  if (!val || typeof val !== "object") return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.agent === "string" &&
    typeof obj.task === "string" &&
    typeof obj.status === "string" &&
    typeof obj.startedAt === "string" &&
    typeof obj.eventCount === "number"
  );
};

const isValidAgentEvent = (val: unknown): val is AgentEvent => {
  if (!val || typeof val !== "object") return false;
  const obj = val as Record<string, unknown>;
  return typeof obj.seq === "number" && typeof obj.type === "string";
};

/** Create a new session — writes initial meta and empty events file */
export const createSession = (rootDir: string, meta: SessionMeta): void => {
  const dir = sessionsDir(rootDir);
  mkdirSync(dir, { recursive: true });

  writeFileSync(metaPath(rootDir, meta.id), JSON.stringify(meta, null, 2));
  writeFileSync(eventsPath(rootDir, meta.id), "");
};

/** Append an agent event to the session's JSONL event log */
export const appendEvent = (
  rootDir: string,
  sessionId: string,
  event: AgentEvent,
): void => {
  appendFileSync(eventsPath(rootDir, sessionId), JSON.stringify(event) + "\n");
};

/** Atomically update session metadata (temp file + rename) */
export const updateSessionMeta = (rootDir: string, meta: SessionMeta): void => {
  const dest = metaPath(rootDir, meta.id);
  const tmpPath = join(
    sessionsDir(rootDir),
    `.${meta.id}.meta.${process.pid}.json`,
  );

  writeFileSync(tmpPath, JSON.stringify(meta, null, 2));

  try {
    renameSync(tmpPath, dest);
  } catch (err) {
    try {
      unlinkSync(tmpPath);
    } catch {
      /* cleanup best-effort */
    }
    throw err;
  }
};

/** Load session metadata by exact ID or ID prefix */
export const loadSessionMeta = (
  rootDir: string,
  sessionIdOrPrefix: string,
): SessionMeta | null => {
  const id = resolveSessionId(rootDir, sessionIdOrPrefix);
  if (!id) return null;

  try {
    const data = readFileSync(metaPath(rootDir, id), "utf-8");
    const parsed: unknown = JSON.parse(data);
    return isValidSessionMeta(parsed) ? parsed : null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
};

/** Load all events for a session */
export interface LoadEventsResult {
  readonly items: readonly AgentEvent[];
  readonly invalidLineCount: number;
}

export const loadSessionEvents = (
  rootDir: string,
  sessionIdOrPrefix: string,
): LoadEventsResult => {
  const id = resolveSessionId(rootDir, sessionIdOrPrefix);
  if (!id) return { items: [], invalidLineCount: 0 };

  let data: string;
  try {
    data = readFileSync(eventsPath(rootDir, id), "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT")
      return { items: [], invalidLineCount: 0 };
    throw err;
  }

  const items: AgentEvent[] = [];
  let invalidLineCount = 0;

  for (const line of data.split("\n")) {
    if (line.trim().length === 0) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (isValidAgentEvent(parsed)) {
        items.push(parsed);
      } else {
        invalidLineCount++;
      }
    } catch {
      invalidLineCount++;
    }
  }

  return { items, invalidLineCount };
};

/** List all sessions, sorted by startedAt descending (most recent first) */
export const listSessions = (rootDir: string): readonly SessionMeta[] => {
  const dir = sessionsDir(rootDir);
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const metaFiles = entries.filter((e) => e.endsWith(".meta.json"));
  const sessions: SessionMeta[] = [];

  for (const file of metaFiles) {
    try {
      const data = readFileSync(join(dir, file), "utf-8");
      const parsed: unknown = JSON.parse(data);
      if (isValidSessionMeta(parsed)) sessions.push(parsed);
    } catch {
      // skip invalid meta files
    }
  }

  return sessions.sort((a, b) => (a.startedAt > b.startedAt ? -1 : 1));
};

/** Resolve a session ID prefix to a full ID */
const resolveSessionId = (
  rootDir: string,
  idOrPrefix: string,
): string | null => {
  if (idOrPrefix.length === 0) return null;
  const dir = sessionsDir(rootDir);
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }

  // Exact match first
  if (entries.includes(`${idOrPrefix}.meta.json`)) return idOrPrefix;

  // Prefix match
  const matches = entries
    .filter((e) => e.endsWith(".meta.json") && e.startsWith(idOrPrefix))
    .map((e) => e.replace(".meta.json", ""));

  return matches.length === 1 ? matches[0]! : null;
};
