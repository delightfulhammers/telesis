import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";

const START_MARKER = "# --- telesis pre-commit hook ---";
const END_MARKER = "# --- end telesis pre-commit hook ---";

const HOOK_BODY = `${START_MARKER}
# Installed by: telesis hooks install
# Runs preflight checks before allowing commits.
# Defers if Claude Code hook already ran preflight (marker file).

MARKER=".telesis/.preflight-ran"

# Defer if Claude Code hook already ran preflight recently (within 60s).
# Marker contains a Unix timestamp written by the Claude Code hook.
if [ -f "$MARKER" ]; then
  MARKER_TS=$(cat "$MARKER" 2>/dev/null || echo 0)
  NOW=$(date +%s)
  MARKER_AGE=$(( NOW - MARKER_TS ))
  if [ "$MARKER_AGE" -ge 0 ] && [ "$MARKER_AGE" -lt 60 ]; then
    rm -f "$MARKER"
    exit 0
  fi
  rm -f "$MARKER"
fi

# Run preflight — only if telesis is on PATH
if command -v telesis &>/dev/null; then
  telesis orchestrator preflight 2>&1
  RESULT=$?
  if [ $RESULT -ne 0 ]; then
    echo "Telesis preflight checks failed. Commit blocked." >&2
    echo "Run 'telesis orchestrator preflight' to see details." >&2
    exit 1
  fi
fi
${END_MARKER}`;

const hookPath = (rootDir: string): string =>
  join(rootDir, ".git", "hooks", "pre-commit");

/** Check if the project has a .git directory */
const ensureGitRepo = (rootDir: string): void => {
  if (!existsSync(join(rootDir, ".git"))) {
    throw new Error(`Not a git repository: ${rootDir}. Run 'git init' first.`);
  }
};

/** Install the telesis pre-commit git hook */
export const installHook = (rootDir: string): void => {
  ensureGitRepo(rootDir);

  const hooksDir = join(rootDir, ".git", "hooks");
  mkdirSync(hooksDir, { recursive: true });

  const path = hookPath(rootDir);
  let existing = "";

  if (existsSync(path)) {
    existing = readFileSync(path, "utf-8");
    // Already installed — idempotent
    if (existing.includes(START_MARKER)) return;
  }

  const normalized = existing.trim();
  const content = normalized
    ? `${normalized}\n\n${HOOK_BODY}\n`
    : `#!/bin/bash\n${HOOK_BODY}\n`;

  writeFileSync(path, content);
  chmodSync(path, 0o755);
};

/** Remove the telesis section from the pre-commit hook */
export const uninstallHook = (rootDir: string): void => {
  const path = hookPath(rootDir);

  if (!existsSync(path)) return;

  const content = readFileSync(path, "utf-8");
  if (!content.includes(START_MARKER)) return;

  const startIdx = content.indexOf(START_MARKER);
  if (startIdx === -1) return;

  const endIdx = content.indexOf(END_MARKER);
  // If end marker is missing, remove from start marker to end of file (truncated install)
  const before = content.slice(0, startIdx).trimEnd();
  const after =
    endIdx !== -1 ? content.slice(endIdx + END_MARKER.length).trimStart() : "";

  const remaining = [before, after].filter(Boolean).join("\n");
  writeFileSync(path, remaining ? remaining + "\n" : "");
};

/** Check if the telesis pre-commit hook is installed */
export const isHookInstalled = (rootDir: string): boolean => {
  const path = hookPath(rootDir);
  if (!existsSync(path)) return false;
  const content = readFileSync(path, "utf-8");
  return content.includes(START_MARKER);
};
