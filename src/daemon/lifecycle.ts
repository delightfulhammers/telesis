import { resolve } from "node:path";
import { readPid, runningPid } from "./pid.js";
import { connect } from "./client.js";

const POLL_INTERVAL_MS = 100;
const POLL_TIMEOUT_MS = 3000;

/** Wait for the PID file to appear and contain a running process */
const waitForPid = async (rootDir: string): Promise<number> => {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const pid = runningPid(rootDir);
    if (pid !== null) return pid;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error("daemon did not start within 3 seconds");
};

export interface DaemonStartResult {
  readonly pid: number;
  readonly alreadyRunning: boolean;
}

/** Start the daemon as a detached background process */
export const startDaemon = async (
  rootDir: string,
): Promise<DaemonStartResult> => {
  const resolvedRoot = resolve(rootDir);

  // Check if already running
  const existingPid = runningPid(resolvedRoot);
  if (existingPid !== null) {
    return { pid: existingPid, alreadyRunning: true };
  }

  // Use the real binary path — process.execPath works in both compiled binaries
  // (where argv[0] is "bun") and dev mode (where execPath is the bun binary).
  const binary = process.execPath;

  const proc = Bun.spawn([binary, "daemon", "__run"], {
    cwd: resolvedRoot,
    stdio: ["ignore", "ignore", "ignore"],
    detached: true,
  });
  proc.unref();

  const pid = await waitForPid(resolvedRoot);
  return { pid, alreadyRunning: false };
};

export interface DaemonStatusResult {
  readonly running: boolean;
  readonly pid?: number;
  readonly uptimeMs?: number;
  readonly eventCount?: number;
  readonly clientCount?: number;
}

/** Query the daemon's current status */
export const daemonStatus = async (
  rootDir: string,
): Promise<DaemonStatusResult> => {
  const resolvedRoot = resolve(rootDir);
  const pid = runningPid(resolvedRoot);

  if (pid === null) {
    return { running: false };
  }

  try {
    const client = await connect(resolvedRoot);
    try {
      const response = await client.sendCommand("status");
      if (response.ok && response.data) {
        const data = response.data as Record<string, unknown>;
        return {
          running: true,
          pid,
          uptimeMs: data.uptimeMs as number | undefined,
          eventCount: data.eventCount as number | undefined,
          clientCount: data.clientCount as number | undefined,
        };
      }
    } finally {
      client.disconnect();
    }
  } catch {
    // Socket connection failed — process is running but socket isn't ready
  }

  return { running: true, pid };
};

/** Stop the daemon gracefully via the socket */
export const stopDaemon = async (rootDir: string): Promise<boolean> => {
  const resolvedRoot = resolve(rootDir);
  const pid = runningPid(resolvedRoot);

  if (pid === null) {
    return false;
  }

  try {
    const client = await connect(resolvedRoot);
    try {
      await client.sendCommand("stop");
    } finally {
      client.disconnect();
    }
  } catch {
    // If we can't connect, try SIGTERM directly
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      return false;
    }
  }

  // Wait for process to exit
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (runningPid(resolvedRoot) === null) return true;
    await new Promise((r) => setTimeout(r, 100));
  }

  return runningPid(resolvedRoot) === null;
};
