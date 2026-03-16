import {
  mkdirSync,
  writeFileSync,
  chmodSync,
  existsSync,
  openSync,
  closeSync,
  renameSync,
  unlinkSync,
  constants,
} from "node:fs";
import { join, dirname } from "node:path";
import { save, exists } from "../config/config.js";
import type { Config } from "../config/config.js";
import { generate } from "../context/context.js";
import { renderTemplate } from "../templates/index.js";
import type { TemplateName } from "../templates/index.js";

interface DocFile {
  readonly template: TemplateName;
  readonly dest: string;
}

const DOC_FILES: readonly DocFile[] = [
  { template: "vision.md.tmpl", dest: "docs/VISION.md" },
  { template: "prd.md.tmpl", dest: "docs/PRD.md" },
  { template: "architecture.md.tmpl", dest: "docs/ARCHITECTURE.md" },
  { template: "milestones.md.tmpl", dest: "docs/MILESTONES.md" },
];

const README_STUBS: Record<string, string> = {
  "docs/adr/README.md":
    "# Architectural Decision Records (ADRs)\n\nThis directory contains ADR files created by `telesis adr new <slug>`.\n\nEach ADR captures a significant architectural decision with its context, rationale, and consequences.\n",
  "docs/tdd/README.md":
    "# Technical Design Documents (TDDs)\n\nThis directory contains TDD files created by `telesis tdd new <slug>`.\n\nEach TDD details the design of a specific component or subsystem.\n",
};

let atomicCounter = 0;

const validateInput = (cfg: Config): void => {
  if (!cfg.project.name) {
    throw new Error("project name is required");
  }

  const fields: readonly { name: string; value: string }[] = [
    { name: "name", value: cfg.project.name },
    { name: "owner", value: cfg.project.owner },
    ...cfg.project.languages.map((l, i) => ({
      name: `languages[${i}]`,
      value: l,
    })),
    { name: "status", value: cfg.project.status },
    { name: "repo", value: cfg.project.repo },
  ];

  for (const { name, value } of fields) {
    if (/[\x00\n\r]/.test(value)) {
      throw new Error(
        `project ${name} contains invalid characters (newlines or null bytes)`,
      );
    }
    if (value.includes("{{")) {
      throw new Error(
        `project ${name} contains invalid character sequence '{{' `,
      );
    }
  }
};

const applyDefaults = (cfg: Config): Config => ({
  project: {
    ...cfg.project,
    status: cfg.project.status || "active",
  },
});

const createDirectories = (rootDir: string): void => {
  const dirs = [
    join(rootDir, "docs", "adr"),
    join(rootDir, "docs", "tdd"),
    join(rootDir, "docs", "context"),
    join(rootDir, ".claude", "hooks"),
  ];
  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true, mode: 0o755 });
  }
};

const writeFileAtomic = (dest: string, content: string): void => {
  const dir = dirname(dest);
  mkdirSync(dir, { recursive: true, mode: 0o755 });

  const tmpPath = join(dir, `.scaffold-${process.pid}-${++atomicCounter}`);

  const fd = openSync(
    tmpPath,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    0o666,
  );

  try {
    writeFileSync(fd, content);
  } catch (err) {
    try {
      closeSync(fd);
    } catch {
      /* best-effort */
    }
    try {
      unlinkSync(tmpPath);
    } catch {
      /* best-effort */
    }
    throw err;
  }

  closeSync(fd);

  try {
    renameSync(tmpPath, dest);
  } catch (err) {
    try {
      unlinkSync(tmpPath);
    } catch {
      /* cleanup best-effort */
    }
    throw err;
  }
};

const renderDocStubs = (rootDir: string, cfg: Config): void => {
  const data = {
    ProjectName: cfg.project.name,
    ProjectOwner: cfg.project.owner,
  };

  for (const df of DOC_FILES) {
    const content = renderTemplate(df.template, data);
    const dest = join(rootDir, df.dest);
    writeFileAtomic(dest, content);
  }
};

const writeREADMEStubs = (rootDir: string): void => {
  for (const [relPath, content] of Object.entries(README_STUBS)) {
    const dest = join(rootDir, relPath);
    writeFileAtomic(dest, content);
  }
};

const generateCLAUDEMD = (rootDir: string): void => {
  const output = generate(rootDir);
  const dest = join(rootDir, "CLAUDE.md");
  writeFileAtomic(dest, output);
};

const CLAUDE_SETTINGS_JSON = `{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/git-preflight.sh"
          }
        ]
      }
    ]
  }
}
`;

const GIT_PREFLIGHT_SH = `#!/bin/bash
# Telesis preflight hook for Claude Code
# Gates git commit on orchestrator preflight checks.

if ! command -v jq &>/dev/null; then
  echo "Warning: jq not found, skipping telesis preflight" >&2
  exit 0
fi

INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')
FIRST_LINE=$(printf '%s' "$COMMAND" | head -1)

if [[ "$FIRST_LINE" =~ (^|[[:space:]]|&&|;)git[[:space:]]+commit([[:space:]]|$) ]]; then
  cd "$CLAUDE_PROJECT_DIR" || exit 0

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
    if [ $? -ne 0 ]; then
      echo "Telesis preflight checks failed. The commit has been blocked." >&2
      exit 2
    fi
  fi
fi

exit 0
`;

const writeClaudeHooks = (rootDir: string): void => {
  // Guard: don't overwrite existing Claude Code settings or hooks
  const settingsPath = join(rootDir, ".claude", "settings.json");
  if (!existsSync(settingsPath)) {
    writeFileAtomic(settingsPath, CLAUDE_SETTINGS_JSON);
  }

  const hookPath = join(rootDir, ".claude", "hooks", "git-preflight.sh");
  if (!existsSync(hookPath)) {
    writeFileAtomic(hookPath, GIT_PREFLIGHT_SH);
    chmodSync(hookPath, 0o755);
  }
};

export const scaffold = (rootDir: string, cfg: Config): void => {
  validateInput(cfg);

  if (exists(rootDir)) {
    throw new Error(
      "project already initialized (run `telesis context` to regenerate CLAUDE.md)",
    );
  }

  const local = applyDefaults(cfg);

  createDirectories(rootDir);
  renderDocStubs(rootDir, local);
  writeREADMEStubs(rootDir);
  writeClaudeHooks(rootDir);

  // Config must be saved before CLAUDE.md generation
  save(rootDir, local);
  generateCLAUDEMD(rootDir);
};
