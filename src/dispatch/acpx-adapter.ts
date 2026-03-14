import { execFileSync } from "node:child_process";
import type { AgentAdapter } from "./adapter.js";
import type { AgentEvent } from "./types.js";

/** Minimal subprocess shape needed by the adapter */
export interface SpawnResult {
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  readonly exited: Promise<number>;
}

/** Options passed to spawn — env is optional and only set when needed */
export interface SpawnOpts {
  readonly stdout: "pipe";
  readonly stderr: "pipe";
  readonly env?: Record<string, string | undefined>;
}

/** Spawn function signature matching Bun.spawn's subset we use */
export type SpawnFn = (cmd: readonly string[], opts: SpawnOpts) => SpawnResult;

/** Default spawn using Bun.spawn */
const defaultSpawn: SpawnFn = (cmd, opts) =>
  Bun.spawn(cmd as string[], opts) as SpawnResult;

/**
 * Resolve the installed claude CLI path.
 * Returns the absolute path if found on PATH, undefined otherwise.
 * When set as CLAUDE_CODE_EXECUTABLE, this tells the claude ACP agent
 * to use the installed binary instead of its bundled (potentially stale) copy.
 */
export const resolveClaudeExecutable = (): string | undefined => {
  try {
    const path = execFileSync("which", ["claude"], {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    return path || undefined;
  } catch {
    return undefined;
  }
};

/** Spawn acpx and wait for it to exit, returning stdout */
const runAcpx = async (
  spawn: SpawnFn,
  acpxPath: string,
  args: readonly string[],
  env?: Record<string, string | undefined>,
): Promise<string> => {
  const proc = spawn([acpxPath, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env,
  });

  // Drain both streams concurrently to avoid pipe deadlock
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    const detail = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n");
    throw new Error(`acpx exited with code ${exitCode}: ${detail}`);
  }

  return stdout.trim();
};

/** Check if acpx is available on the system */
const checkAcpxAvailable = async (
  spawn: SpawnFn,
  acpxPath: string,
): Promise<void> => {
  try {
    const proc = spawn([acpxPath, "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    // Drain streams to avoid deadlock, then check exit code
    const [, , exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (exitCode !== 0) {
      throw new Error(
        `acpx at "${acpxPath}" exited with code ${exitCode}. Ensure it is properly installed: npm install -g acpx`,
      );
    }
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes("ENOENT") || err.message.includes("not found"))
    ) {
      throw new Error(
        `acpx not found at "${acpxPath}". Install it with: npm install -g acpx`,
      );
    }
    throw err;
  }
};

/** Synthesize an AgentEvent from JSON-RPC session/update messages */
const parseJsonRpcUpdate = (
  obj: Record<string, unknown>,
  nextSeq: () => number,
): AgentEvent | null => {
  if (obj.jsonrpc !== "2.0") return null;

  // Handle session/update notifications (agent activity)
  if (obj.method === "session/update") {
    const params = obj.params as Record<string, unknown> | undefined;
    if (!params) return null;
    const update = params.update as Record<string, unknown> | undefined;
    if (!update) return null;

    const sessionId =
      typeof params.sessionId === "string" ? params.sessionId : "unknown";
    const updateType = update.sessionUpdate as string | undefined;

    if (updateType === "agent_message_chunk") {
      const content = update.content as Record<string, unknown> | undefined;
      if (!content) return null;
      const contentType = content.type as string | undefined;

      if (contentType === "text") {
        return {
          eventVersion: 1,
          sessionId,
          requestId: "jsonrpc",
          seq: nextSeq(),
          stream: "main",
          type: "output",
          text: typeof content.text === "string" ? content.text : "",
        };
      }

      if (contentType === "tool_call") {
        return {
          eventVersion: 1,
          sessionId,
          requestId: "jsonrpc",
          seq: nextSeq(),
          stream: "main",
          type: "tool_call",
          tool: typeof content.name === "string" ? content.name : "unknown",
          input: typeof content.input === "string" ? content.input : "",
        };
      }

      if (contentType === "tool_result") {
        return {
          eventVersion: 1,
          sessionId,
          requestId: "jsonrpc",
          seq: nextSeq(),
          stream: "main",
          type: "output",
          text:
            typeof content.output === "string"
              ? content.output
              : JSON.stringify(
                  typeof content.output !== "undefined" ? content.output : "",
                ),
        };
      }

      // Thinking/reasoning content
      if (contentType === "thinking" || contentType === "reasoning") {
        return {
          eventVersion: 1,
          sessionId,
          requestId: "jsonrpc",
          seq: nextSeq(),
          stream: "main",
          type: "thinking",
        };
      }
    }

    // Usage updates are informational — skip
    if (updateType === "usage_update") return null;

    // Available commands updates — skip
    if (updateType === "available_commands_update") return null;
  }

  // Prompt completion results — skip
  if (typeof obj.id !== "undefined" && obj.result !== undefined) return null;

  return null;
};

/**
 * Parse a single NDJSON line into an AgentEvent.
 * Supports both legacy NDJSON events (seq+type) and JSON-RPC session/update messages.
 * Returns null for lines that aren't valid agent events.
 */
const parseAgentEvent = (
  line: string,
  nextSeq: () => number,
): AgentEvent | null => {
  try {
    const parsed: unknown = JSON.parse(line);
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;

    // Legacy NDJSON format (seq + type)
    if (typeof obj.seq === "number" && typeof obj.type === "string") {
      return parsed as AgentEvent;
    }

    // JSON-RPC format (acpx 0.3+)
    if (obj.jsonrpc === "2.0") {
      return parseJsonRpcUpdate(obj, nextSeq);
    }

    return null;
  } catch {
    return null;
  }
};

/**
 * Read NDJSON from a subprocess stdout, calling onEvent for each parsed line.
 * Uses the same line-buffering pattern as src/daemon/socket.ts handleData.
 */
const streamNdjson = async (
  proc: SpawnResult,
  onEvent: (event: AgentEvent) => void,
  nextSeq: () => number,
): Promise<void> => {
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        if (line.length === 0) continue;

        const event = parseAgentEvent(line, nextSeq);
        if (event) onEvent(event);
      }
    }

    // Process any remaining buffer content
    const remaining = buffer.trim();
    if (remaining.length > 0) {
      const event = parseAgentEvent(remaining, nextSeq);
      if (event) onEvent(event);
    }
  } finally {
    reader.releaseLock();
  }
};

export interface AcpxAdapterOptions {
  readonly acpxPath?: string;
  /** Auto-approve all agent tool calls (default: true) */
  readonly approveAll?: boolean;
  /** Override spawn function (for testing) */
  readonly spawn?: SpawnFn;
  /** Override claude executable resolution (for testing) */
  readonly resolveClaude?: () => string | undefined;
}

/** Create an AgentAdapter backed by acpx subprocess calls */
export const createAcpxAdapter = (
  options: AcpxAdapterOptions = {},
): AgentAdapter => {
  const acpxPath = options.acpxPath ?? "acpx";
  const approveAll = options.approveAll ?? true;
  const spawn = options.spawn ?? defaultSpawn;
  let availabilityChecked = false;

  // Resolve installed claude path once at creation time.
  // If found, we set CLAUDE_CODE_EXECUTABLE so the ACP agent uses the installed
  // binary instead of its bundled copy (which may be a stale version).
  const claudePath = (options.resolveClaude ?? resolveClaudeExecutable)();
  const claudeEnv = claudePath
    ? { ...process.env, CLAUDE_CODE_EXECUTABLE: claudePath }
    : undefined;

  /** Return claude-specific env when agent is "claude", undefined otherwise */
  const envForAgent = (
    agent: string,
  ): Record<string, string | undefined> | undefined =>
    agent === "claude" ? claudeEnv : undefined;

  const ensureAvailable = async (): Promise<void> => {
    if (availabilityChecked) return;
    await checkAcpxAvailable(spawn, acpxPath);
    availabilityChecked = true;
  };

  return {
    createSession: async (agent, name, cwd) => {
      await ensureAvailable();
      try {
        // Top-level --cwd, then agent subcommand
        await runAcpx(
          spawn,
          acpxPath,
          ["--cwd", cwd, agent, "sessions", "ensure", "--name", name],
          envForAgent(agent),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("Internal error") || msg.includes("Query closed")) {
          throw new Error(
            `Failed to create ${agent} session. The ${agent} ACP agent could not initialize. ` +
              `This is typically an issue with the agent server, not Telesis. ` +
              `Try a different agent (e.g., --agent codex) or check that the ${agent} agent is properly configured.`,
          );
        }
        throw err;
      }
      return name;
    },

    prompt: async (agent, sessionName, text, cwd, onEvent) => {
      await ensureAvailable();

      /** Monotonically increasing sequence counter for this prompt call */
      let seqCounter = 0;
      const nextSeq = (): number => ++seqCounter;

      // Top-level flags (--cwd, --format, --approve-all) go before agent subcommand
      const args = [acpxPath, "--cwd", cwd, "--format", "json"];
      if (approveAll) args.push("--approve-all");
      args.push(agent, "prompt", text, "--session", sessionName);

      const env = envForAgent(agent);
      const proc = spawn(args, { stdout: "pipe", stderr: "pipe", env });

      try {
        // Drain stderr concurrently to avoid pipe deadlock
        const stderrPromise = new Response(proc.stderr).text();
        await streamNdjson(proc, onEvent, nextSeq);
        const [stderr, exitCode] = await Promise.all([
          stderrPromise,
          proc.exited,
        ]);

        if (exitCode !== 0) {
          throw new Error(
            `acpx prompt exited with code ${exitCode}: ${stderr.trim()}`,
          );
        }
      } catch (err) {
        // Ensure subprocess is awaited to prevent zombies
        await proc.exited.catch(() => {});
        throw err;
      }
    },

    cancel: async (agent, sessionName, cwd) => {
      await ensureAvailable();
      await runAcpx(
        spawn,
        acpxPath,
        ["--cwd", cwd, agent, "cancel", "--session", sessionName],
        envForAgent(agent),
      );
    },

    closeSession: async (agent, name, cwd) => {
      await ensureAvailable();
      await runAcpx(
        spawn,
        acpxPath,
        ["--cwd", cwd, agent, "sessions", "close", name],
        envForAgent(agent),
      );
    },
  };
};
