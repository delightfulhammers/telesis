import { execFileSync } from "node:child_process";

/** Strip characters that could break or inject into AppleScript strings */
const sanitize = (s: string): string => s.replace(/["\\\n\r]/g, "");

/**
 * Sends a macOS notification. Best-effort — never throws.
 */
export const notify = (title: string, message: string): void => {
  try {
    execFileSync("osascript", [
      "-e",
      `display notification "${sanitize(message)}" with title "Telesis" subtitle "${sanitize(title)}"`,
    ]);
  } catch {
    // best-effort — don't crash if notifications unavailable
  }
};
