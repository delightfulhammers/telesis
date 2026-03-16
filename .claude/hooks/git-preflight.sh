#!/bin/bash
# Telesis preflight hook for Claude Code
# Gates git commit on orchestrator preflight checks.
# Also blocks git commit --amend on pushed commits.

# Require jq for JSON parsing
if ! command -v jq &>/dev/null; then
  echo "Warning: jq not found, skipping telesis preflight" >&2
  exit 0
fi

INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')

# Extract the first line of the command (before any heredoc/pipe)
# to avoid matching git commit inside message bodies.
# Known limitation: multi-line command blocks with git commit on line 2+
# bypass this check. Claude Code typically sends single-line git commands.
FIRST_LINE=$(printf '%s' "$COMMAND" | head -1)

# Only intercept commands that start with git commit (anchored pattern)
if [[ "$FIRST_LINE" =~ (^|[[:space:]]|&&|;)git[[:space:]]+commit([[:space:]]|$) ]]; then
  cd "$CLAUDE_PROJECT_DIR" || exit 0

  # Block git commit --amend on pushed branches to prevent history rewrite
  if [[ "$FIRST_LINE" == *"--amend"* ]]; then
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
    if [ -n "$CURRENT_BRANCH" ]; then
      REMOTE_SHA=$(git rev-parse "origin/$CURRENT_BRANCH" 2>/dev/null)
      LOCAL_SHA=$(git rev-parse HEAD 2>/dev/null)
      if [ "$REMOTE_SHA" = "$LOCAL_SHA" ]; then
        echo "Blocked: git commit --amend on a pushed commit rewrites history." >&2
        echo "Create a new commit instead." >&2
        exit 2
      fi
    fi
  fi

  # Only use telesis on PATH — never execute relative-path binaries
  if command -v telesis &>/dev/null; then
    telesis orchestrator preflight 2>&1
    RESULT=$?

    if [ $RESULT -ne 0 ]; then
      echo "Telesis preflight checks failed. The commit has been blocked." >&2
      echo "Run 'telesis orchestrator preflight' to see details." >&2
      exit 2
    fi
  fi
fi

exit 0
