import type { AgentAdapter } from "./adapter.js";
import type { AgentEvent } from "./types.js";

/** Minimal subprocess shape needed by the adapter */
export interface SpawnResult {
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  readonly exited: Promise<number>;
}

/** Spawn function signature matching Bun.spawn's subset we use */
export type SpawnFn = (
  cmd: readonly string[],
  opts: { stdout: "pipe"; stderr: "pipe" },
) => SpawnResult;

/** Default spawn using Bun.spawn */
const defaultSpawn: SpawnFn = (cmd, opts) =>
  Bun.spawn(cmd as string[], opts) as SpawnResult;

/** Spawn acpx and wait for it to exit, returning stdout */
const runAcpx = async (
  spawn: SpawnFn,
  acpxPath: string,
  args: readonly string[],
): Promise<string> => {
  const proc = spawn([acpxPath, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(
      `acpx exited with code ${exitCode}: ${stderr.trim() || stdout.trim()}`,
    );
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
    await proc.exited;
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

/**
 * Parse a single NDJSON line into an AgentEvent.
 * Returns null for lines that aren't valid agent events.
 */
const parseAgentEvent = (line: string): AgentEvent | null => {
  try {
    const parsed: unknown = JSON.parse(line);
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.seq !== "number" || typeof obj.type !== "string")
      return null;
    return parsed as AgentEvent;
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

        const event = parseAgentEvent(line);
        if (event) onEvent(event);
      }
    }

    // Process any remaining buffer content
    const remaining = buffer.trim();
    if (remaining.length > 0) {
      const event = parseAgentEvent(remaining);
      if (event) onEvent(event);
    }
  } finally {
    reader.releaseLock();
  }
};

export interface AcpxAdapterOptions {
  readonly acpxPath?: string;
  /** Override spawn function (for testing) */
  readonly spawn?: SpawnFn;
}

/** Create an AgentAdapter backed by acpx subprocess calls */
export const createAcpxAdapter = (
  options: AcpxAdapterOptions = {},
): AgentAdapter => {
  const acpxPath = options.acpxPath ?? "acpx";
  const spawn = options.spawn ?? defaultSpawn;
  let availabilityChecked = false;

  const ensureAvailable = async (): Promise<void> => {
    if (availabilityChecked) return;
    await checkAcpxAvailable(spawn, acpxPath);
    availabilityChecked = true;
  };

  return {
    createSession: async (agent, name, cwd) => {
      await ensureAvailable();
      await runAcpx(spawn, acpxPath, [
        agent,
        "sessions",
        "ensure",
        "--name",
        name,
        "--cwd",
        cwd,
      ]);
      return name;
    },

    prompt: async (agent, sessionName, text, cwd, onEvent) => {
      await ensureAvailable();

      const proc = spawn(
        [
          acpxPath,
          agent,
          "prompt",
          text,
          "--name",
          sessionName,
          "--cwd",
          cwd,
          "--format",
          "json",
          "--approve-all",
        ],
        { stdout: "pipe", stderr: "pipe" },
      );

      await streamNdjson(proc, onEvent);
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        throw new Error(
          `acpx prompt exited with code ${exitCode}: ${stderr.trim()}`,
        );
      }
    },

    cancel: async (agent, sessionName, cwd) => {
      await ensureAvailable();
      await runAcpx(spawn, acpxPath, [
        agent,
        "cancel",
        "--name",
        sessionName,
        "--cwd",
        cwd,
      ]);
    },

    closeSession: async (agent, name, cwd) => {
      await ensureAvailable();
      await runAcpx(spawn, acpxPath, [
        agent,
        "sessions",
        "close",
        name,
        "--cwd",
        cwd,
      ]);
    },
  };
};
