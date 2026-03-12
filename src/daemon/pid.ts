import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { join, dirname } from "node:path";

const PID_FILENAME = "daemon.pid";

const pidPath = (rootDir: string): string =>
  join(rootDir, ".telesis", PID_FILENAME);

/** Write the current process PID to the PID file */
export const writePid = (rootDir: string, pid: number = process.pid): void => {
  const path = pidPath(rootDir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, String(pid), "utf-8");
};

/** Read the PID from the PID file, or null if it doesn't exist */
export const readPid = (rootDir: string): number | null => {
  const path = pidPath(rootDir);
  try {
    const content = readFileSync(path, "utf-8").trim();
    const pid = parseInt(content, 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
};

/** Check if a process with the given PID is running (kill -0) */
export const isRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** Remove the PID file */
export const removePid = (rootDir: string): void => {
  try {
    unlinkSync(pidPath(rootDir));
  } catch {
    // best-effort — file may already be gone
  }
};

/** Check if a daemon is currently running and return its PID, or null */
export const runningPid = (rootDir: string): number | null => {
  const pid = readPid(rootDir);
  if (pid === null) return null;
  return isRunning(pid) ? pid : null;
};
