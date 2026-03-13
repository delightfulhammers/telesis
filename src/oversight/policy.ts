import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as yaml from "js-yaml";
import type { AutonomyLevel, PolicyFile, TriggerMode } from "./types.js";

const AGENTS_DIR = ".telesis/agents";
const DEFAULT_MODEL = "claude-sonnet-4-6";

const VALID_AUTONOMY: ReadonlySet<string> = new Set([
  "observe",
  "alert",
  "intervene",
]);
const VALID_TRIGGER: ReadonlySet<string> = new Set([
  "periodic",
  "on-output",
  "on-complete",
]);

/** Model names must match `claude-<variant>-<version>` or similar safe patterns */
const MODEL_PATTERN = /^[a-z0-9][\w.:-]{0,63}$/;

/** Split a markdown file into YAML frontmatter and body */
export const splitFrontmatter = (
  content: string,
): { readonly frontmatter: string; readonly body: string } => {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") {
    return { frontmatter: "", body: content };
  }

  const closingIdx = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (closingIdx === -1) {
    return { frontmatter: "", body: content };
  }

  const frontmatter = lines.slice(1, closingIdx).join("\n");
  const body = lines
    .slice(closingIdx + 1)
    .join("\n")
    .trim();
  return { frontmatter, body };
};

/** Load and parse a single policy file */
export const loadPolicy = (agentsDir: string, name: string): PolicyFile => {
  const filePath = join(agentsDir, `${name}.md`);
  const content = readFileSync(filePath, "utf-8");
  return parsePolicy(content);
};

/** Parse a policy file from raw content */
export const parsePolicy = (content: string): PolicyFile => {
  const { frontmatter, body } = splitFrontmatter(content);

  if (frontmatter.length === 0) {
    throw new Error("policy file missing YAML frontmatter");
  }

  const raw = yaml.load(frontmatter, { schema: yaml.JSON_SCHEMA }) as
    | Record<string, unknown>
    | undefined;

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("policy frontmatter must be a YAML mapping");
  }

  if (typeof raw.name !== "string" || raw.name.length === 0) {
    throw new Error("policy file missing required field: name");
  }

  const version =
    typeof raw.version === "number" && raw.version > 0 ? raw.version : 1;

  const enabled = typeof raw.enabled === "boolean" ? raw.enabled : false;

  const autonomy: AutonomyLevel =
    typeof raw.autonomy === "string" && VALID_AUTONOMY.has(raw.autonomy)
      ? (raw.autonomy as AutonomyLevel)
      : "alert";

  const trigger: TriggerMode =
    typeof raw.trigger === "string" && VALID_TRIGGER.has(raw.trigger)
      ? (raw.trigger as TriggerMode)
      : "periodic";

  const intervalEvents =
    typeof raw.intervalEvents === "number" && raw.intervalEvents > 0
      ? raw.intervalEvents
      : 10;

  const model =
    typeof raw.model === "string" && MODEL_PATTERN.test(raw.model)
      ? raw.model
      : DEFAULT_MODEL;

  return {
    name: raw.name,
    version,
    enabled,
    autonomy,
    trigger,
    intervalEvents,
    model,
    systemPrompt: body,
  };
};

/** Load all policy files from .telesis/agents/ directory */
export const loadAllPolicies = (rootDir: string): readonly PolicyFile[] => {
  const agentsDir = join(rootDir, AGENTS_DIR);

  let entries: string[];
  try {
    entries = readdirSync(agentsDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`oversight: cannot read agents directory: ${msg}`);
    }
    return [];
  }

  const policies: PolicyFile[] = [];

  for (const filename of entries.filter((e) => e.endsWith(".md")).sort()) {
    try {
      const content = readFileSync(join(agentsDir, filename), "utf-8");
      policies.push(parsePolicy(content));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`oversight: skipping policy ${filename}: ${msg}`);
    }
  }

  return policies;
};
