import type { AgentEvent } from "./types.js";

/**
 * Abstraction over an ACP agent runtime. Implementations handle subprocess
 * management, session lifecycle, and NDJSON event streaming.
 *
 * The sole production implementation is AcpxAdapter (acpx-adapter.ts).
 * Tests use FakeAgentAdapter for deterministic event sequences.
 */
export interface AgentAdapter {
  /** Create (or ensure) a named session for the given agent */
  readonly createSession: (
    agent: string,
    name: string,
    cwd: string,
  ) => Promise<string>;

  /** Send a prompt and stream NDJSON events via onEvent callback */
  readonly prompt: (
    agent: string,
    sessionName: string,
    text: string,
    cwd: string,
    onEvent: (event: AgentEvent) => void,
  ) => Promise<void>;

  /** Cancel the currently running prompt */
  readonly cancel: (
    agent: string,
    sessionName: string,
    cwd: string,
  ) => Promise<void>;

  /** Close and clean up a named session */
  readonly closeSession: (
    agent: string,
    name: string,
    cwd: string,
  ) => Promise<void>;
}
