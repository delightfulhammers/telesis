import { readFileSync, readdirSync, type Dirent } from "node:fs";
import { join } from "node:path";
import { load } from "../config/config.js";
import { loadNotes } from "../notes/store.js";

const isENOENT = (err: unknown): boolean =>
  (err as NodeJS.ErrnoException).code === "ENOENT";

const readFileSafe = (path: string): string => {
  try {
    return readFileSync(path, "utf-8");
  } catch (err) {
    if (isENOENT(err)) return "";
    throw err;
  }
};

const isSectionBoundary = (trimmed: string): boolean =>
  trimmed === "---" ||
  (trimmed.startsWith("# ") && !trimmed.startsWith("##")) ||
  trimmed.startsWith("## ");

const extractSection = (content: string, headerRe: RegExp): string => {
  const lines = content.split("\n");
  let capturing = false;
  const result: string[] = [];

  for (const line of lines) {
    if (!capturing && headerRe.test(line)) {
      capturing = true;
      continue;
    }
    if (capturing) {
      if (isSectionBoundary(line.trim())) break;
      result.push(line);
    }
  }

  return result.join("\n").trim();
};

/** Assembled project context for an agent dispatch */
export interface DispatchContext {
  readonly projectName: string;
  readonly primaryLanguage: string;
  readonly vision: string;
  readonly architecture: string;
  readonly conventions: string;
  readonly activeMilestone: string;
  readonly activeAdrs: string;
  readonly notes: string;
  readonly claudeMd: string;
}

/** Extract the first non-Complete milestone from MILESTONES.md */
const extractActiveMilestone = (rootDir: string): string => {
  const content = readFileSafe(join(rootDir, "docs", "MILESTONES.md"));
  if (content.length === 0) return "";

  const lines = content.split("\n");
  let capturing = false;
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Start capturing at a ## heading that isn't followed by "Complete"
    if (trimmed.startsWith("## ") && !capturing) {
      // Check if the next few lines contain "Complete"
      const idx = lines.indexOf(line);
      const lookahead = lines.slice(idx, idx + 5).join("\n");
      if (lookahead.includes("**Status:** Complete")) continue;
      capturing = true;
      result.push(line);
      continue;
    }

    if (capturing) {
      // Stop at the next ## heading
      if (trimmed.startsWith("## ")) break;
      result.push(line);
    }
  }

  return result.join("\n").trim();
};

const ADR_STATUS_RE = /^\*\*Status:\*\*\s*(.+)/i;

/** Extract summaries of non-superseded ADRs */
const extractActiveADRs = (rootDir: string): string => {
  const adrDir = join(rootDir, "docs", "adr");
  let entries: Dirent[];
  try {
    entries = readdirSync(adrDir, { withFileTypes: true });
  } catch (err) {
    if (isENOENT(err)) return "";
    throw err;
  }

  const adrs = entries
    .filter((e) => !e.isDirectory() && /^ADR-.*\.md$/.test(e.name))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const summaries: string[] = [];

  for (const entry of adrs) {
    const content = readFileSync(join(adrDir, entry.name), "utf-8");
    const lines = content.split("\n");
    const statusLine = lines.find((l) => ADR_STATUS_RE.test(l.trim()));
    if (!statusLine) continue;
    const status = ADR_STATUS_RE.exec(statusLine.trim())?.[1]?.trim() ?? "";
    if (status.toLowerCase().startsWith("superseded")) continue;

    const titleLine = lines.find((l) => l.trim().startsWith("# "));
    const title = titleLine?.replace(/^#\s+/, "").trim() ?? entry.name;
    const decision = extractSection(content, /^##\s+Decision/i);
    summaries.push(
      `### ${title}\n${decision || "(no decision section found)"}`,
    );
  }

  return summaries.join("\n\n");
};

/** Extract working conventions from docs/context/*.md */
const extractConventions = (rootDir: string): string => {
  const contextDir = join(rootDir, "docs", "context");
  let entries: Dirent[];
  try {
    entries = readdirSync(contextDir, { withFileTypes: true });
  } catch (err) {
    if (isENOENT(err)) return "";
    throw err;
  }

  return entries
    .filter((e) => !e.isDirectory() && e.name.endsWith(".md"))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((e) => readFileSync(join(contextDir, e.name), "utf-8").trim())
    .join("\n\n");
};

/** Extract development notes */
const extractNotes = (rootDir: string): string => {
  const { items: notes } = loadNotes(rootDir);
  if (notes.length === 0) return "";

  return notes
    .map((n) => {
      const tagPrefix = n.tags.length > 0 ? `[${n.tags.join(", ")}] ` : "";
      return `- ${tagPrefix}${n.text}`;
    })
    .join("\n");
};

/** Assemble full project context for agent dispatch */
export const assembleDispatchContext = (rootDir: string): DispatchContext => {
  const cfg = load(rootDir);

  const visionContent = readFileSafe(join(rootDir, "docs", "VISION.md"));
  const vision =
    visionContent.length > 0
      ? visionContent.slice(0, 10_000) // Cap vision content
      : "";

  const archContent = readFileSafe(join(rootDir, "docs", "ARCHITECTURE.md"));
  const architecture =
    archContent.length > 0
      ? archContent.slice(0, 20_000) // Cap architecture content
      : "";

  return {
    projectName: cfg.project.name,
    primaryLanguage: cfg.project.language,
    vision,
    architecture,
    conventions: extractConventions(rootDir),
    activeMilestone: extractActiveMilestone(rootDir),
    activeAdrs: extractActiveADRs(rootDir),
    notes: extractNotes(rootDir),
    claudeMd: readFileSafe(join(rootDir, "CLAUDE.md")),
  };
};

/** Format context into a system-prompt-style text block for the agent */
export const formatContextPrompt = (ctx: DispatchContext): string => {
  const sections: string[] = [];

  sections.push(
    `# Project: ${ctx.projectName}`,
    `Primary language: ${ctx.primaryLanguage}`,
  );

  if (ctx.claudeMd.length > 0) {
    sections.push("---\n\n## Project Context (CLAUDE.md)\n\n" + ctx.claudeMd);
  }

  if (ctx.activeMilestone.length > 0) {
    sections.push("---\n\n## Active Milestone\n\n" + ctx.activeMilestone);
  }

  if (ctx.activeAdrs.length > 0) {
    sections.push(
      "---\n\n## Active Architectural Decisions\n\n" + ctx.activeAdrs,
    );
  }

  if (ctx.notes.length > 0) {
    sections.push("---\n\n## Development Notes\n\n" + ctx.notes);
  }

  return sections.join("\n\n");
};
