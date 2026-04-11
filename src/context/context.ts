import {
  readFileSync,
  readdirSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  openSync,
  closeSync,
  constants,
  type Dirent,
} from "node:fs";
import { join, basename } from "node:path";
import { load } from "../config/config.js";
import type { DocLayer, DocLayerScope } from "../config/config.js";
import { extractActiveMilestone } from "../milestones/parse.js";
import { renderTemplate } from "../templates/index.js";
import { loadNotes } from "../notes/store.js";
import { renderNotesSection } from "../notes/format.js";
import { loadEntries } from "../journal/store.js";
import { renderJournalSection } from "../journal/format.js";

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

interface ScannedTDD {
  readonly name: string;
  readonly status: string;
  readonly overview: string;
  readonly interfaces: string;
  readonly path: string;
  readonly num: number;
}

const TDD_NUMBER_RE = /^TDD-(\d+)/;
const TDD_TITLE_RE = /^#\s+TDD-\d+\s*[—–-]\s*(.+)/m;
const TDD_STATUS_RE = /^\*\*Status:\*\*\s*(.+)/m;
const OVERVIEW_HEADER_RE = /^##\s+Overview/i;
const INTERFACES_HEADER_RE = /^##\s+Interfaces/i;

const MAX_INLINED_TDDS = 10;

/** Extract a section from content string (avoids re-reading the file). */
const extractSectionFromContent = (content: string, re: RegExp): string => {
  const lines = content.split("\n");
  let capturing = false;
  const result: string[] = [];

  for (const line of lines) {
    if (!capturing && re.test(line)) {
      capturing = true;
      continue;
    }
    if (capturing) {
      const trimmed = line.trim();
      if (isSectionBoundary(trimmed)) break;
      result.push(line);
    }
  }

  return result.join("\n").trim();
};

const scanTDDs = (tddDir: string): { items: ScannedTDD[]; count: number } => {
  let entries: Dirent[];
  try {
    entries = readdirSync(tddDir, { withFileTypes: true });
  } catch (err) {
    if (isENOENT(err)) return { items: [], count: 0 };
    throw err;
  }

  const tddFiles = entries.filter(
    (entry) => !entry.isDirectory() && /^TDD-.*\.md$/.test(entry.name),
  );

  if (tddFiles.length === 0) return { items: [], count: 0 };

  const tdds: ScannedTDD[] = [];

  for (const entry of tddFiles) {
    const filePath = join(tddDir, entry.name);
    const content = readFileSync(filePath, "utf-8");

    // Extract status
    let status = "Draft";
    const statusMatch = TDD_STATUS_RE.exec(content);
    if (statusMatch?.[1]) {
      status = statusMatch[1].trim();
    }

    // Skip superseded TDDs
    if (status.toLowerCase() === "superseded") continue;

    // Extract TDD number
    const numMatch = TDD_NUMBER_RE.exec(entry.name);
    const num = numMatch?.[1] ? parseInt(numMatch[1], 10) : 0;

    // Extract title
    let name = entry.name.replace(/\.md$/, "");
    const titleMatch = TDD_TITLE_RE.exec(content);
    if (titleMatch?.[1]) {
      name = `${entry.name.replace(/\.md$/, "").split("-").slice(0, 2).join("-")}: ${titleMatch[1].trim()}`;
    }

    // Extract sections from the single read — no re-reading the file
    const overview = extractSectionFromContent(content, OVERVIEW_HEADER_RE);
    const interfaces = extractSectionFromContent(content, INTERFACES_HEADER_RE);

    tdds.push({
      name,
      status,
      overview,
      interfaces,
      path: entry.name,
      num,
    });
  }

  // Sort by number, take most recent
  tdds.sort((a, b) => a.num - b.num);
  const recent = tdds.slice(Math.max(0, tdds.length - MAX_INLINED_TDDS));

  return { items: recent, count: tddFiles.length };
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

/** Check if a layer's include list covers a given scope */
const layerIncludes = (layer: DocLayer, scope: DocLayerScope): boolean => {
  return layer.include.includes("all") || layer.include.includes(scope);
};

export const generate = (rootDir: string): string => {
  const cfg = load(rootDir);
  const contextConfig = cfg.context ?? {
    layers: [{ path: "docs", include: ["all" as DocLayerScope] }],
  };

  // Collect ADRs, TDDs, and context files across all layers
  let allADRSummaries: string[] = [];
  let totalADRCount = 0;
  let allTDDItems: ScannedTDD[] = [];
  let totalTDDCount = 0;
  let allContextSections: ContextSection[] = [];

  // For singular docs, use the last (most local) layer that includes them
  let milestonesContent = "";
  let principles = "";
  let description = "";

  for (const layer of contextConfig.layers) {
    const layerPath = join(rootDir, layer.path);

    if (layerIncludes(layer, "adrs")) {
      const { summaries, count } = scanADRs(join(layerPath, "adr"));
      allADRSummaries = allADRSummaries.concat(summaries);
      totalADRCount += count;
    }

    if (layerIncludes(layer, "tdds")) {
      const { items: layerTDDs, count: layerTDDCount } = scanTDDs(
        join(layerPath, "tdd"),
      );
      allTDDItems = allTDDItems.concat(layerTDDs);
      totalTDDCount += layerTDDCount;
    }

    if (layerIncludes(layer, "context")) {
      const sections = scanContextFiles(join(layerPath, "context"));
      allContextSections = allContextSections.concat(sections);
    }

    if (layerIncludes(layer, "milestones")) {
      const content = extractActiveMilestone(join(layerPath, "MILESTONES.md"));
      if (content) milestonesContent = content;
    }

    if (layerIncludes(layer, "vision")) {
      const p = extractSection(
        join(layerPath, "VISION.md"),
        PRINCIPLES_HEADER_RE,
        false,
      );
      if (p) principles = p;

      const d = extractSection(
        join(layerPath, "VISION.md"),
        DESCRIPTION_HEADER_RE,
        false,
      );
      if (d) description = d;
    }
  }

  // Deduplicate ADR summaries by number (later layers override), sort, take 5.
  // Unparseable ADRs (num=0) get unique negative keys to avoid collision.
  const adrByNum = new Map<number, string>();
  let unparseableIdx = 0;
  for (const summary of allADRSummaries) {
    const num = parseADRNumber(summary);
    const key = num === 0 ? -(++unparseableIdx) : num;
    adrByNum.set(key, summary);
  }
  const sortedADRs = [...adrByNum.values()].sort((a, b) => {
    return parseADRNumber(a) - parseADRNumber(b);
  });
  const recentADRs = sortedADRs.slice(Math.max(0, sortedADRs.length - 5));

  // Deduplicate TDDs by num, sort, cap at MAX_INLINED_TDDS.
  // Unparseable TDDs (num=0) get unique negative keys to avoid collision.
  const tddByNum = new Map<number, ScannedTDD>();
  let unparseableTDDIdx = 0;
  for (const tdd of allTDDItems) {
    const key = tdd.num === 0 ? -(++unparseableTDDIdx) : tdd.num;
    tddByNum.set(key, tdd);
  }
  const sortedTDDs = [...tddByNum.values()].sort((a, b) => a.num - b.num);
  const recentTDDs = sortedTDDs.slice(
    Math.max(0, sortedTDDs.length - MAX_INLINED_TDDS),
  );

  const { items: notes } = loadNotes(rootDir);
  const notesSection = renderNotesSection(notes);

  const { items: journalEntries } = loadEntries(rootDir);
  const journalSection = renderJournalSection(journalEntries);

  const now = new Date();
  const generatedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return renderTemplate("claude.md.tmpl", {
    ProjectName: cfg.project.name,
    ProjectOwner: cfg.project.owner,
    ProjectLanguage: cfg.project.languages.join(", ") || cfg.project.language,
    ProjectStatus: cfg.project.status,
    ProjectRepo: cfg.project.repo,
    GeneratedDate: generatedDate,
    Description: description,
    MilestonesContent: milestonesContent,
    ADRs: recentADRs.length > 0 ? { items: recentADRs } : false,
    ADRCount: totalADRCount,
    TDDCount: totalTDDCount,
    TDDs: recentTDDs.length > 0 ? { items: recentTDDs } : false,
    Principles: principles,
    ContextSections: allContextSections,
    JournalSection: journalSection || false,
    NotesSection: notesSection || false,
  });
};

/**
 * Generates CLAUDE.md and atomically writes it to the project root.
 * Uses temp file + rename to avoid partial writes.
 */
export const generateAndWrite = (rootDir: string): void => {
  const output = generate(rootDir);
  const claudePath = join(rootDir, "CLAUDE.md");
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmpPath = join(rootDir, `.CLAUDE-${suffix}.md`);

  const fd = openSync(
    tmpPath,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    0o666,
  );

  try {
    writeFileSync(fd, output);
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
    renameSync(tmpPath, claudePath);
  } catch (err) {
    try {
      unlinkSync(tmpPath);
    } catch {
      /* cleanup best-effort */
    }
    throw err;
  }
};
