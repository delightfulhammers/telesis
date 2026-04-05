import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
  existsSync,
} from "node:fs";
import { join, resolve } from "node:path";

// Old-style generic markers (pre-v0.33.0) — used for migration detection
const LEGACY_START_MARKER = "# --- telesis pre-commit hook ---";
const LEGACY_END_MARKER = "# --- end telesis pre-commit hook ---";

/** Validate that a path is safe to embed in a bash double-quoted string */
const assertSafePath = (path: string): void => {
  if (/["`$\\\x60!]/.test(path) || /[\x00-\x1f\x7f]/.test(path)) {
    throw new Error(
      `Project root path contains shell-unsafe characters: ${path}`,
    );
  }
};

/** Build project-specific markers using the absolute path */
const startMarker = (absRoot: string): string =>
  `# --- telesis pre-commit hook: ${absRoot} ---`;
const endMarker = (absRoot: string): string =>
  `# --- end telesis pre-commit hook: ${absRoot} ---`;

/** Build the hook body with the project root baked in as an absolute path.
 *  This ensures the hook works when git root ≠ project root (monorepos). */
const buildHookBody = (absRoot: string): string => {
  return `${startMarker(absRoot)}
# Installed by: telesis hooks install
# Runs preflight checks before allowing commits.
# Defers if Claude Code hook already ran preflight (marker file).

PROJECT_ROOT="${absRoot}"
MARKER="$PROJECT_ROOT/.telesis/.preflight-ran"

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

# Run preflight from the project root — only if telesis is on PATH
if command -v telesis &>/dev/null; then
  (cd "$PROJECT_ROOT" && telesis orchestrator preflight 2>&1)
  RESULT=$?
  if [ $RESULT -ne 0 ]; then
    echo "Telesis preflight checks failed. Commit blocked." >&2
    echo "Run 'telesis orchestrator preflight' to see details." >&2
    exit 1
  fi
fi
${endMarker(absRoot)}`;
};

const hookPath = (gitRoot: string): string =>
  join(gitRoot, ".git", "hooks", "pre-commit");

/** Check that gitRoot contains a .git directory or file */
const ensureGitRepo = (gitRoot: string): void => {
  if (!existsSync(join(gitRoot, ".git"))) {
    throw new Error(`Not a git repository: ${gitRoot}. Run 'git init' first.`);
  }
};

/** Install the telesis pre-commit git hook.
 *  @param projectRoot — where .telesis/ lives
 *  @param gitRoot — where .git/ lives (may be an ancestor of projectRoot) */
export const installHook = (projectRoot: string, gitRoot?: string): void => {
  const effectiveGitRoot = gitRoot ?? projectRoot;
  const absRoot = resolve(projectRoot);
  assertSafePath(absRoot);
  ensureGitRepo(effectiveGitRoot);

  const hooksDir = join(effectiveGitRoot, ".git", "hooks");
  mkdirSync(hooksDir, { recursive: true });

  const path = hookPath(effectiveGitRoot);
  let existing = "";

  if (existsSync(path)) {
    existing = readFileSync(path, "utf-8");
    // Migrate: remove legacy generic hook section (pre-v0.33.0)
    // Runs before idempotency check so legacy sections are always cleaned up.
    if (existing.includes(LEGACY_START_MARKER)) {
      const legacyStart = existing.indexOf(LEGACY_START_MARKER);
      const legacyEnd = existing.indexOf(LEGACY_END_MARKER);
      const before = existing.slice(0, legacyStart).trimEnd();
      const after =
        legacyEnd !== -1 && legacyEnd > legacyStart
          ? existing.slice(legacyEnd + LEGACY_END_MARKER.length).trimStart()
          : "";
      existing = [before, after].filter(Boolean).join("\n");
    }
    // Already installed for this project — idempotent
    if (existing.includes(startMarker(absRoot))) return;
  }

  const hookBody = buildHookBody(absRoot);
  const normalized = existing.trim();
  const content = normalized
    ? `${normalized}\n\n${hookBody}\n`
    : `#!/bin/bash\n${hookBody}\n`;

  writeFileSync(path, content);
  chmodSync(path, 0o755);
};

/** Remove the telesis section for a specific project from the pre-commit hook */
export const uninstallHook = (projectRoot: string, gitRoot?: string): void => {
  const effectiveGitRoot = gitRoot ?? projectRoot;
  const absRoot = resolve(projectRoot);
  const path = hookPath(effectiveGitRoot);

  if (!existsSync(path)) return;

  const content = readFileSync(path, "utf-8");
  const start = startMarker(absRoot);
  const end = endMarker(absRoot);

  if (!content.includes(start)) return;

  const startIdx = content.indexOf(start);
  if (startIdx === -1) return;

  const endIdx = content.indexOf(end);
  if (endIdx === -1) {
    process.stderr.write(
      `[telesis] Warning: hook end marker missing in ${path} — skipping removal to avoid data loss\n`,
    );
    return;
  }
  const before = content.slice(0, startIdx).trimEnd();
  const after = content.slice(endIdx + end.length).trimStart();

  const remaining = [before, after].filter(Boolean).join("\n");
  writeFileSync(path, remaining ? remaining + "\n" : "");
};

/** Check if the telesis pre-commit hook is installed for a specific project */
export const isHookInstalled = (
  projectRoot: string,
  gitRoot?: string,
): boolean => {
  const effectiveGitRoot = gitRoot ?? projectRoot;
  const absRoot = resolve(projectRoot);
  const path = hookPath(effectiveGitRoot);
  if (!existsSync(path)) return false;
  const content = readFileSync(path, "utf-8");
  return content.includes(startMarker(absRoot));
};
