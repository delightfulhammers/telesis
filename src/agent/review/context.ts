import { readFileSync, readdirSync, type Dirent } from "node:fs";
import { join } from "node:path";
import { load } from "../../config/config.js";
import { loadNotes } from "../../notes/store.js";
import type { ReviewContext } from "./types.js";

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

const extractSectionFromLines = (
  lines: readonly string[],
  headerRe: RegExp,
): string => {
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

const extractSection = (content: string, headerRe: RegExp): string =>
  extractSectionFromLines(content.split("\n"), headerRe);

const extractMultipleSections = (
  content: string,
  headerRes: readonly RegExp[],
): string => {
  const lines = content.split("\n");
  const sections = headerRes
    .map((re) => extractSectionFromLines(lines, re))
    .filter((s) => s.length > 0);
  return sections.join("\n\n");
};

const ARCH_SECTIONS = [
  /^##\s+Package Discipline/i,
  /^##\s+Import Rules/i,
  /^##\s+Error Handling/i,
  /^###\s+Error handling/i,
];

const extractArchRules = (rootDir: string): string => {
  const content = readFileSafe(join(rootDir, "docs", "ARCHITECTURE.md"));
  if (content.length === 0) return "";
  return extractMultipleSections(content, ARCH_SECTIONS);
};

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

const ADR_STATUS_RE = /^\*\*Status:\*\*\s*(.+)/i;

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
    const decision = extractSectionFromLines(lines, /^##\s+Decision/i);
    summaries.push(
      `### ${title}\n${decision || "(no decision section found)"}`,
    );
  }

  return summaries.join("\n\n");
};

const extractTDDContracts = (rootDir: string): string => {
  const tddDir = join(rootDir, "docs", "tdd");
  let entries: Dirent[];
  try {
    entries = readdirSync(tddDir, { withFileTypes: true });
  } catch (err) {
    if (isENOENT(err)) return "";
    throw err;
  }

  const tdds = entries
    .filter((e) => !e.isDirectory() && /^TDD-.*\.md$/.test(e.name))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const summaries: string[] = [];

  for (const entry of tdds) {
    const content = readFileSync(join(tddDir, entry.name), "utf-8");
    const lines = content.split("\n");
    const titleLine = lines.find((l) => l.trim().startsWith("# "));
    const title = titleLine?.replace(/^#\s+/, "").trim() ?? entry.name;
    const decisions = extractSectionFromLines(lines, /^##\s+Decisions/i);
    if (decisions.length > 0) {
      summaries.push(`### ${title}\n${decisions}`);
    }
  }

  return summaries.join("\n\n");
};

const extractPrdCommands = (rootDir: string): string => {
  const content = readFileSafe(join(rootDir, "docs", "PRD.md"));
  if (content.length === 0) return "";
  return extractSection(content, /^##\s+Commands/i);
};

const extractNotes = (rootDir: string): string => {
  const notes = loadNotes(rootDir);
  if (notes.length === 0) return "";

  return notes
    .map((n) => {
      const tagPrefix = n.tags.length > 0 ? `[${n.tags.join(", ")}] ` : "";
      return `- ${tagPrefix}${n.text}`;
    })
    .join("\n");
};

export const assembleReviewContext = (rootDir: string): ReviewContext => {
  const cfg = load(rootDir);

  const parts: string[] = [];

  const prdCommands = extractPrdCommands(rootDir);
  if (prdCommands.length > 0) {
    parts.push("## CLI Command Contracts\n\n" + prdCommands);
  }

  const archRules = extractArchRules(rootDir);
  if (archRules.length > 0) {
    parts.push("## Architecture Rules\n\n" + archRules);
  }

  const conventions = extractConventions(rootDir);
  if (conventions.length > 0) {
    parts.push("## Working Conventions\n\n" + conventions);
  }

  const adrs = extractActiveADRs(rootDir);
  if (adrs.length > 0) {
    parts.push("## Active Architectural Decisions\n\n" + adrs);
  }

  const tddContracts = extractTDDContracts(rootDir);
  if (tddContracts.length > 0) {
    parts.push("## Component Design Decisions\n\n" + tddContracts);
  }

  const notes = extractNotes(rootDir);
  if (notes.length > 0) {
    parts.push("## Development Notes\n\n" + notes);
  }

  const conventionsText =
    parts.length > 0
      ? parts.join("\n\n---\n\n")
      : "No project-specific review criteria found. Apply general code review best practices.";

  return {
    conventions: conventionsText,
    projectName: cfg.project.name,
    primaryLanguage: cfg.project.language,
  };
};
