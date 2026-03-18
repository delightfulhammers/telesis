import { mkdirSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { exists } from "../config/config.js";

// Skills embedded at build time via Bun text imports
// @ts-ignore — Bun file import
import skillPipeline from "../../.claude/skills/telesis-pipeline/SKILL.md" with { type: "text" };
// @ts-ignore
import skillReview from "../../.claude/skills/telesis-review/SKILL.md" with { type: "text" };
// @ts-ignore
import skillNotes from "../../.claude/skills/telesis-notes/SKILL.md" with { type: "text" };
// @ts-ignore
import skillMilestone from "../../.claude/skills/telesis-milestone/SKILL.md" with { type: "text" };
// @ts-ignore
import skillInitReview from "../../.claude/skills/telesis-init-review/SKILL.md" with { type: "text" };
// @ts-ignore
import skillUpgrade from "../../.claude/skills/telesis-upgrade/SKILL.md" with { type: "text" };

const EMBEDDED_SKILLS: ReadonlyMap<string, string> = new Map([
  ["telesis-pipeline", skillPipeline],
  ["telesis-review", skillReview],
  ["telesis-notes", skillNotes],
  ["telesis-milestone", skillMilestone],
  ["telesis-init-review", skillInitReview],
  ["telesis-upgrade", skillUpgrade],
]);

export interface UpgradeItem {
  readonly path: string;
  readonly kind: "directory" | "file" | "executable";
  readonly description: string;
}

export interface UpgradeFailure {
  readonly item: UpgradeItem;
  readonly error: string;
}

export interface UpgradeResult {
  readonly added: readonly UpgradeItem[];
  readonly alreadyPresent: readonly UpgradeItem[];
  readonly failed: readonly UpgradeFailure[];
}

/**
 * All scaffold artifacts that telesis upgrade manages.
 * Each item knows how to check for existence and how to create itself.
 */
interface ArtifactSpec {
  readonly relativePath: string;
  readonly kind: "directory" | "file" | "executable";
  readonly description: string;
  readonly create: (rootDir: string) => void;
}

/** Resolve telesis-mcp absolute path from the running binary's sibling. */
const resolveMcpBinary = (): string => {
  const binaryName = basename(process.execPath);
  if (binaryName === "bun" || binaryName === "node") {
    throw new Error(
      "Cannot resolve telesis-mcp path in dev mode. Run from the compiled binary or create .mcp.json manually.",
    );
  }
  const sibling = join(dirname(process.execPath), "telesis-mcp");
  if (existsSync(sibling)) return sibling;
  throw new Error(
    "telesis-mcp not found alongside telesis binary. Reinstall or create .mcp.json manually.",
  );
};

/** Get embedded skill content. Available in both dev and compiled binary. */
const loadSkillContent = (skillName: string): string | null =>
  EMBEDDED_SKILLS.get(skillName) ?? null;

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

const SKILL_NAMES = [...EMBEDDED_SKILLS.keys()];

const buildArtifacts = (): readonly ArtifactSpec[] => {
  const artifacts: ArtifactSpec[] = [
    // Directories
    {
      relativePath: "docs/adr",
      kind: "directory",
      description: "ADR directory",
      create: (rootDir) =>
        mkdirSync(join(rootDir, "docs", "adr"), { recursive: true }),
    },
    {
      relativePath: "docs/tdd",
      kind: "directory",
      description: "TDD directory",
      create: (rootDir) =>
        mkdirSync(join(rootDir, "docs", "tdd"), { recursive: true }),
    },
    {
      relativePath: "docs/context",
      kind: "directory",
      description: "Context sections directory",
      create: (rootDir) =>
        mkdirSync(join(rootDir, "docs", "context"), { recursive: true }),
    },
    // Claude Code hooks
    {
      relativePath: ".claude/settings.json",
      kind: "file",
      description: "Claude Code hook configuration",
      create: (rootDir) => {
        mkdirSync(join(rootDir, ".claude", "hooks"), { recursive: true });
        writeFileSync(
          join(rootDir, ".claude", "settings.json"),
          CLAUDE_SETTINGS_JSON,
        );
      },
    },
    {
      relativePath: ".claude/hooks/git-preflight.sh",
      kind: "executable",
      description: "Git commit preflight hook",
      create: (rootDir) => {
        mkdirSync(join(rootDir, ".claude", "hooks"), { recursive: true });
        const hookPath = join(rootDir, ".claude", "hooks", "git-preflight.sh");
        writeFileSync(hookPath, GIT_PREFLIGHT_SH);
        chmodSync(hookPath, 0o755);
      },
    },
    // MCP config
    {
      relativePath: ".mcp.json",
      kind: "file",
      description: "MCP server configuration",
      create: (rootDir) => {
        const command = resolveMcpBinary();
        const config =
          JSON.stringify({ mcpServers: { telesis: { command } } }, null, 2) +
          "\n";
        writeFileSync(join(rootDir, ".mcp.json"), config);
      },
    },
  ];

  // Skills — only include skills whose content is available
  for (const name of SKILL_NAMES) {
    const content = loadSkillContent(name);
    if (!content) continue; // skill content not available — omit from artifact list
    artifacts.push({
      relativePath: `.claude/skills/${name}/SKILL.md`,
      kind: "file",
      description: `Telesis skill: ${name}`,
      create: (rootDir) => {
        const dir = join(rootDir, ".claude", "skills", name);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "SKILL.md"), content);
      },
    });
  }

  return artifacts;
};

/** Shared iteration: classify artifacts and optionally create missing ones. */
const classifyArtifacts = (rootDir: string, apply: boolean): UpgradeResult => {
  if (!exists(rootDir)) {
    throw new Error("Project not initialized. Run `telesis init` first.");
  }

  const artifacts = buildArtifacts();
  const added: UpgradeItem[] = [];
  const alreadyPresent: UpgradeItem[] = [];
  const failed: UpgradeFailure[] = [];

  for (const artifact of artifacts) {
    const fullPath = join(rootDir, artifact.relativePath);
    const item: UpgradeItem = {
      path: artifact.relativePath,
      kind: artifact.kind,
      description: artifact.description,
    };

    if (existsSync(fullPath)) {
      alreadyPresent.push(item);
    } else if (apply) {
      try {
        artifact.create(rootDir);
        added.push(item);
      } catch (err) {
        failed.push({
          item,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      added.push(item);
    }
  }

  return { added, alreadyPresent, failed };
};

/** Check which scaffold artifacts are missing. */
export const checkUpgrade = (rootDir: string): UpgradeResult =>
  classifyArtifacts(rootDir, false);

/** Apply missing scaffold artifacts. Never overwrites existing files. */
export const applyUpgrade = (rootDir: string): UpgradeResult =>
  classifyArtifacts(rootDir, true);
