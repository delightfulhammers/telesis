import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export interface DiscoveredDoc {
  readonly relPath: string;
  readonly type:
    | "vision"
    | "prd"
    | "architecture"
    | "milestones"
    | "design"
    | "adr"
    | "tdd"
    | "readme";
  readonly content: string;
}

export interface DiscoveredDocs {
  readonly docs: readonly DiscoveredDoc[];
  readonly adrDirs: readonly string[];
  readonly tddDirs: readonly string[];
}

export interface DiscoveryOptions {
  readonly maxDepth?: number;
  readonly maxTotalBytes?: number;
  readonly skipDirs?: readonly string[];
  /** Skip reading file content — only discover paths and types. Default: false */
  readonly readContent?: boolean;
}

const DEFAULT_MAX_DEPTH = 4;
const DEFAULT_MAX_TOTAL_BYTES = 32_768;

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".telesis",
  ".claude",
  "vendor",
  "dist",
  "build",
  "__pycache__",
  ".venv",
  "target",
  "coverage",
  ".next",
  ".nuxt",
]);

/** Map known filenames to doc types. Case-sensitive. */
const FILENAME_TYPES: ReadonlyMap<string, DiscoveredDoc["type"]> = new Map([
  ["ARCHITECTURE.md", "architecture"],
  ["PRD.md", "prd"],
  ["VISION.md", "vision"],
  ["MILESTONES.md", "milestones"],
  ["DESIGN.md", "design"],
  ["README.md", "readme"],
]);

const ADR_RE = /^ADR-\d+.*\.md$/;
const TDD_RE = /^TDD-\d+.*\.md$/;

/**
 * Recursively discover documentation files in a project tree.
 *
 * Finds known doc patterns (ARCHITECTURE.md, PRD.md, ADR-*.md, etc.) at any
 * depth up to maxDepth, skipping noise directories. Returns file content with
 * total size capped at maxTotalBytes.
 *
 * When readContent is false, only file paths and types are returned (content
 * is empty string). Use this for detection-only callers that don't need content.
 */
export const discoverDocs = (
  rootDir: string,
  opts?: DiscoveryOptions,
): DiscoveredDocs => {
  const maxDepth = opts?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxTotalBytes = opts?.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const readContent = opts?.readContent ?? true;
  const extraSkip = opts?.skipDirs ? new Set(opts.skipDirs) : new Set<string>();

  const docs: DiscoveredDoc[] = [];
  const adrDirSet = new Set<string>();
  const tddDirSet = new Set<string>();

  const MAX_FILES = 200;
  const read = readContent ? safeRead : () => "";

  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth) return;
    if (docs.length >= MAX_FILES) return;

    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (docs.length >= MAX_FILES) return;

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || extraSkip.has(entry.name)) continue;
        if (entry.name.startsWith(".")) continue;
        walk(join(dir, entry.name), depth + 1);
        continue;
      }

      if (!entry.isFile()) continue;

      const relDir = relative(rootDir, dir);
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      const fullPath = join(dir, entry.name);

      // Check known filenames
      const knownType = FILENAME_TYPES.get(entry.name);
      if (knownType) {
        docs.push({ relPath, type: knownType, content: read(fullPath) });
        continue;
      }

      // Check ADR pattern
      if (ADR_RE.test(entry.name)) {
        adrDirSet.add(relDir);
        docs.push({ relPath, type: "adr", content: read(fullPath) });
        continue;
      }

      // Check TDD pattern
      if (TDD_RE.test(entry.name)) {
        tddDirSet.add(relDir);
        docs.push({ relPath, type: "tdd", content: read(fullPath) });
        continue;
      }
    }
  };

  walk(rootDir, 0);

  // Truncate content proportionally to stay within budget
  if (readContent) {
    truncateToBudget(docs, maxTotalBytes);
  }

  return {
    docs,
    adrDirs: [...adrDirSet].filter(Boolean).sort(),
    tddDirs: [...tddDirSet].filter(Boolean).sort(),
  };
};

const safeRead = (path: string): string => {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
};

const TRUNCATION_SUFFIX = "\n... (truncated)";
const SUFFIX_LEN = TRUNCATION_SUFFIX.length;

/**
 * Truncate doc contents proportionally so total bytes stays within budget.
 * Mutates array elements in place — called before returning from discoverDocs.
 */
const truncateToBudget = (docs: DiscoveredDoc[], budget: number): void => {
  if (budget <= 0) {
    for (let i = 0; i < docs.length; i++) {
      docs[i] = { ...docs[i]!, content: "" };
    }
    return;
  }

  const totalBytes = docs.reduce((sum, d) => sum + d.content.length, 0);
  if (totalBytes <= budget) return;

  // Reserve space for truncation suffixes on every doc (worst case).
  // When suffix overhead alone exceeds budget, zero out all content.
  const effectiveBudget = budget - docs.length * SUFFIX_LEN;
  if (effectiveBudget <= 0) {
    for (let i = 0; i < docs.length; i++) {
      docs[i] = {
        ...docs[i]!,
        content: docs[i]!.content.slice(0, Math.floor(budget / docs.length)),
      };
    }
    return;
  }

  // Cap per-doc minimum to what the effective budget can actually provide
  const minPerDoc = Math.max(
    0,
    Math.min(200, Math.floor(effectiveBudget / docs.length)),
  );
  const reservedMin = docs.length * minPerDoc;
  const distributable = Math.max(0, effectiveBudget - reservedMin);

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i]!;
    const share =
      minPerDoc +
      Math.floor((doc.content.length / totalBytes) * distributable);
    const allowed = Math.max(minPerDoc, share);
    if (doc.content.length > allowed) {
      docs[i] = {
        ...doc,
        content: doc.content.slice(0, allowed) + TRUNCATION_SUFFIX,
      };
    }
  }
};
