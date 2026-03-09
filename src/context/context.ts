import { readFileSync, readdirSync, type Dirent } from "node:fs";
import { join, basename } from "node:path";
import { load } from "../config/config.js";
import { extractActiveMilestone } from "../milestones/parse.js";
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

const isENOENT = (err: unknown): boolean =>
  (err as NodeJS.ErrnoException).code === "ENOENT";

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
  let content: string;
  try {
    content = readFileSync(path, "utf-8");
  } catch (err) {
    if (isENOENT(err)) return "";
    throw err;
  }
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

const scanADRs = (adrDir: string): { summaries: string[]; count: number } => {
  let entries: Dirent[];
  try {
    entries = readdirSync(adrDir, { withFileTypes: true });
  } catch (err) {
    if (isENOENT(err)) return { summaries: [], count: 0 };
    throw err;
  }

  const adrs: NumberedADR[] = entries
    .filter((entry) => !entry.isDirectory() && /^ADR-.*\.md$/.test(entry.name))
    .map((entry) => ({
      path: join(adrDir, entry.name),
      num: parseADRNumber(entry.name),
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
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (isENOENT(err)) return 0;
    throw err;
  }

  return entries.filter(
    (entry) => !entry.isDirectory() && pattern.test(entry.name),
  ).length;
};

const scanContextFiles = (contextDir: string): ContextSection[] => {
  let entries: Dirent[];
  try {
    entries = readdirSync(contextDir, { withFileTypes: true });
  } catch (err) {
    if (isENOENT(err)) return [];
    throw err;
  }

  return entries
    .filter((entry) => !entry.isDirectory() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
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

  const milestonesContent = extractActiveMilestone(
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
    ADRs: adrs.length > 0 ? { items: adrs } : false,
    ADRCount: adrCount,
    TDDCount: tddCount,
    Principles: principles,
    ContextSections: contextSections,
  });
};
