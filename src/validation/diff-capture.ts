// Note: This module executes git commands directly via execFileSync, parallel
// to src/agent/review/diff.ts. These are intentionally separate: diff.ts handles
// staged/unstaged review diffs, while diff-capture.ts handles ref-to-current
// validation diffs. A shared src/git/ module is future work if more callers emerge.
import { execFileSync } from "node:child_process";
import { loadSessionEvents } from "../dispatch/store.js";

const MAX_DIFF_CHARS = 200_000;
const DEFAULT_MAX_SUMMARY_CHARS = 50_000;
const SAFE_REF_RE = /^[a-f0-9]{40}$/;

/** Capture HEAD sha before dispatch */
export const captureRef = (rootDir: string): string =>
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: rootDir,
    encoding: "utf-8",
  }).trim();

/** Get unified diff between a ref and current HEAD */
export const diffSinceRef = (rootDir: string, ref: string): string => {
  if (!SAFE_REF_RE.test(ref)) {
    throw new Error(`invalid ref: "${ref}" (expected hex sha)`);
  }

  // Use `git diff ref` (without HEAD) to include uncommitted changes
  const diff = execFileSync("git", ["diff", ref], {
    cwd: rootDir,
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });

  if (diff.length > MAX_DIFF_CHARS) {
    return (
      diff.slice(0, MAX_DIFF_CHARS) +
      "\n\n[...diff truncated at 200,000 characters]"
    );
  }

  return diff;
};

/** Summarize session events into a text synopsis for the validator */
export const summarizeSessionEvents = (
  rootDir: string,
  sessionId: string,
  maxChars: number = DEFAULT_MAX_SUMMARY_CHARS,
): string => {
  const { items } = loadSessionEvents(rootDir, sessionId);

  const relevantTypes = new Set(["output", "tool_call"]);
  const lines: string[] = [];

  for (const event of items) {
    if (!relevantTypes.has(event.type)) continue;

    const text =
      typeof event.text === "string"
        ? event.text
        : typeof event.tool === "string"
          ? `[tool: ${event.tool}]`
          : `[${event.type}]`;

    lines.push(text);
  }

  const summary = lines.join("\n");

  if (summary.length > maxChars) {
    return (
      summary.slice(0, maxChars) +
      `\n\n[...session summary truncated at ${maxChars.toLocaleString()} characters]`
    );
  }

  return summary;
};
