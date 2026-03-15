#!/bin/bash
# Telesis preflight hook for Claude Code
# Runs before git commit to enforce process consistency:
# - Milestone entry exists
# - Review has converged (if orchestrator is active)
# - Quality gates pass
# - No blocking decisions pending

# Require jq for JSON parsing
if ! command -v jq &>/dev/null; then
  echo "Warning: jq not found, skipping telesis preflight" >&2
  exit 0
fi

INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')

# Only intercept git commit commands (anchored pattern to avoid false positives
# on git commit-graph, git commit-tree, etc.)
if [[ "$COMMAND" =~ (^|[[:space:]])git[[:space:]]+commit([[:space:]]|$) ]]; then
  cd "$CLAUDE_PROJECT_DIR" || exit 0

  # Run telesis preflight if the binary exists
  if command -v telesis &>/dev/null; then
    telesis orchestrator preflight 2>&1
    RESULT=$?

    if [ $RESULT -ne 0 ]; then
      echo "Telesis preflight checks failed. The commit has been blocked." >&2
      echo "Run 'telesis orchestrator preflight' to see details." >&2
      exit 2
    fi
  elif [ -f "./telesis" ]; then
    ./telesis orchestrator preflight 2>&1
    RESULT=$?

    if [ $RESULT -ne 0 ]; then
      echo "Telesis preflight checks failed. The commit has been blocked." >&2
      echo "Run './telesis orchestrator preflight' to see details." >&2
      exit 2
    fi
  fi
fi

exit 0
