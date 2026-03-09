import {
  readFileSync,
  readdirSync,
  existsSync,
  statSync,
} from "node:fs";
import { join, basename } from "node:path";
import { load } from "../config/config.js";
import { renderTemplate } from "../templates/index.js";

interface ContextSection {
  readonly Content: string;
}

interface NumberedADR {
  readonly path: string;
  readonly num: number;
}

const ADR_NUMBER_RE = /^ADR-(\d+)/;
const ADR_TITLE_RE = /^#\s+ADR-\d+:\s*(.+)/;
const PRINCIPLES_HEADER_RE = /^##\s+Design Principles/i;
const DESCRIPTION_HEADER_RE = /^##\s+The Vision/i;
const MILESTONE_HEADING_RE = /^##\s+\S/;
const STATUS_IN_PROGRESS_RE = /^\*\*Status:\*\*\s+In Progress/i;
const STATUS_COMPLETE_RE = /^\*\*Status:\*\*\s+Complete/i;

const isSectionBoundary = (trimmed: string): boolean => {
  if (trimmed === "---") return true;
  if (trimmed.startsWith("# ") && !trimmed.startsWith("##")) return true;
  if (trimmed.startsWith("## ")) return true;
  return false;
};

const extractSection = (
  path: string,
  re: RegExp,
  includeHeading: boolean,
): string => {
  if (!existsSync(path)) return "";

  const content = readFileSync(path, "utf-8");
  const lines = content.split("\n");

  let capturing = false;
  const result: string[] = [];

  for (const line of lines) {
    if (!capturing && re.test(line)) {
      capturing = true;
      if (includeHeading) {
        result.push(line);
      }
      continue;
    }
    if (capturing) {
      const trimmed = line.trim();
      if (isSectionBoundary(trimmed)) {
        break;
      }
      result.push(line);
    }
  }

  return result.join("\n").trim();
};

const parseADRNumber = (path: string): number => {
  const name = basename(path);
  const m = ADR_NUMBER_RE.exec(name);
  if (m && m[1]) {
    return parseInt(m[1], 10);
  }
  return 0;
};

const extractADRSummary = (path: string): string => {
  const content = readFileSync(path, "utf-8");
  const filename = basename(path);
  const name = filename.replace(/\.md$/, "");

  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    const m = ADR_TITLE_RE.exec(trimmed);
    if (m && m[1]) {
      return `${name}: ${m[1]}`;
    }
  }

  return name;
};

const scanADRs = (
  adrDir: string,
): { summaries: string[]; count: number } => {
  if (!existsSync(adrDir)) return { summaries: [], count: 0 };

  let entries: string[];
  try {
    entries = readdirSync(adrDir);
  } catch {
    return { summaries: [], count: 0 };
  }

  const adrs: NumberedADR[] = entries
    .filter((name) => {
      if (statSync(join(adrDir, name)).isDirectory()) return false;
      return /^ADR-.*\.md$/.test(name);
    })
    .map((name) => ({
      path: join(adrDir, name),
      num: parseADRNumber(name),
    }));

  if (adrs.length === 0) return { summaries: [], count: 0 };

  adrs.sort((a, b) => a.num - b.num);

  // Return up to 5 most recent (highest numbered)
  const start = Math.max(0, adrs.length - 5);
  const recent = adrs.slice(start);

  const summaries = recent.map((adr) => extractADRSummary(adr.path));

  return { summaries, count: adrs.length };
};

const countFiles = (dir: string, pattern: RegExp): number => {
  if (!existsSync(dir)) return 0;

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return 0;
  }

  return entries.filter((name) => {
    try {
      if (statSync(join(dir, name)).isDirectory()) return false;
    } catch {
      return false;
    }
    return pattern.test(name);
  }).length;
};

interface MilestoneSection {
  readonly lines: string[];
}

const extractMilestones = (milestonesPath: string): string => {
  if (!existsSync(milestonesPath)) return "";

  const content = readFileSync(milestonesPath, "utf-8");
  const lines = content.split("\n");

  const sections: MilestoneSection[] = [];
  let current: MilestoneSection | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (MILESTONE_HEADING_RE.test(trimmed)) {
      const section: MilestoneSection = { lines: [line] };
      sections.push(section);
      current = section;
      continue;
    }

    if (current !== null) {
      if (trimmed === "---") {
        current = null;
        continue;
      }
      // We need to mutate the lines array — cast to mutable
      (current.lines as string[]).push(line);
    }
  }

  // Prefer "In Progress", fall back to last "Complete"
  let lastComplete: MilestoneSection | null = null;
  for (const section of sections) {
    for (const line of section.lines) {
      const trimmed = line.trim();
      if (STATUS_IN_PROGRESS_RE.test(trimmed)) {
        return section.lines.join("\n").trim();
      }
      if (STATUS_COMPLETE_RE.test(trimmed)) {
        lastComplete = section;
      }
    }
  }

  if (lastComplete !== null) {
    return lastComplete.lines.join("\n").trim();
  }

  return "";
};

const scanContextFiles = (contextDir: string): ContextSection[] => {
  if (!existsSync(contextDir)) return [];

  let entries: string[];
  try {
    entries = readdirSync(contextDir);
  } catch {
    return [];
  }

  return entries
    .filter((name) => {
      try {
        if (statSync(join(contextDir, name)).isDirectory()) return false;
      } catch {
        return false;
      }
      return name.endsWith(".md");
    })
    .sort()
    .map((name) => ({
      Content: readFileSync(join(contextDir, name), "utf-8").trim(),
    }));
};

export const generate = (rootDir: string): string => {
  const cfg = load(rootDir);

  const { summaries: adrs, count: adrCount } = scanADRs(
    join(rootDir, "docs", "adr"),
  );

  const tddCount = countFiles(join(rootDir, "docs", "tdd"), /^TDD-.*\.md$/);

  const milestonesContent = extractMilestones(
    join(rootDir, "docs", "MILESTONES.md"),
  );

  const principles = extractSection(
    join(rootDir, "docs", "VISION.md"),
    PRINCIPLES_HEADER_RE,
    false,
  );

  const description = extractSection(
    join(rootDir, "docs", "VISION.md"),
    DESCRIPTION_HEADER_RE,
    false,
  );

  const contextSections = scanContextFiles(join(rootDir, "docs", "context"));

  const now = new Date();
  const generatedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return renderTemplate("claude.md.tmpl", {
    ProjectName: cfg.project.name,
    ProjectOwner: cfg.project.owner,
    ProjectLanguage: cfg.project.language,
    ProjectStatus: cfg.project.status,
    ProjectRepo: cfg.project.repo,
    GeneratedDate: generatedDate,
    Description: description,
    MilestonesContent: milestonesContent,
    ADRs: adrs,
    ADRCount: adrCount,
    TDDCount: tddCount,
    Principles: principles,
    ContextSections: contextSections,
  });
};
