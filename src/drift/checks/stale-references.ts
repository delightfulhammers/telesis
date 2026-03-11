import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import type { DriftCheck, DriftFinding } from "../types.js";

const LIVING_DOCS = [
  "docs/VISION.md",
  "docs/PRD.md",
  "docs/ARCHITECTURE.md",
  "docs/MILESTONES.md",
];

const BACKTICK_PATH_RE = /`((?:src|docs)\/[^`\s]+)`/g;
const RELATIVE_LINK_RE =
  /\[([^\]]*)\]\(((?![a-zA-Z][a-zA-Z0-9.+-]*:|\/|#)[^)]+)\)/g;
const FENCE_RE = /^```/;
const TEMPLATE_PATTERN_RE = /[{}<>*]/;
const QUERY_OR_FRAGMENT_RE = /[?#].*$/;

interface StaleRef {
  readonly doc: string;
  readonly path: string;
}

const isWithinRoot = (resolvedPath: string, normalizedRoot: string): boolean =>
  resolvedPath === normalizedRoot ||
  resolvedPath.startsWith(normalizedRoot + sep);

const scanDoc = (
  resolvedRoot: string,
  docRelPath: string,
  existsCache: Map<string, boolean>,
): readonly StaleRef[] => {
  const docPath = resolve(resolvedRoot, docRelPath);
  let content: string;
  try {
    content = readFileSync(docPath, "utf-8");
  } catch (err) {
    if (!existsSync(docPath)) return [];
    return [
      {
        doc: docRelPath,
        path: `(unreadable: ${err instanceof Error ? err.message : String(err)})`,
      },
    ];
  }

  const refs: StaleRef[] = [];
  const lines = content.split("\n");
  const docDir = dirname(docPath);
  let inFence = false;

  const checkExists = (absPath: string): boolean => {
    const cached = existsCache.get(absPath);
    if (cached !== undefined) return cached;
    const exists = existsSync(absPath);
    existsCache.set(absPath, exists);
    return exists;
  };

  for (const line of lines) {
    if (FENCE_RE.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    // Backtick-quoted paths
    for (const match of line.matchAll(BACKTICK_PATH_RE)) {
      const refPath = match[1]!;
      if (TEMPLATE_PATTERN_RE.test(refPath)) continue;

      const cleaned = refPath.replace(/\/$/, "");
      const absPath = resolve(resolvedRoot, cleaned);
      if (!isWithinRoot(absPath, resolvedRoot)) continue;
      if (!checkExists(absPath)) {
        refs.push({ doc: docRelPath, path: refPath });
      }
    }

    // Relative markdown links
    for (const match of line.matchAll(RELATIVE_LINK_RE)) {
      const linkTarget = match[2]!;
      if (TEMPLATE_PATTERN_RE.test(linkTarget)) continue;

      const stripped = linkTarget
        .split(/\s+/)[0]!
        .replace(QUERY_OR_FRAGMENT_RE, "");
      if (!stripped) continue;

      const absPath = resolve(docDir, stripped);
      if (!isWithinRoot(absPath, resolvedRoot)) continue;
      if (!checkExists(absPath)) {
        refs.push({ doc: docRelPath, path: linkTarget });
      }
    }
  }

  return refs;
};

const scanContextDir = (rootDir: string): readonly string[] => {
  const contextDir = join(rootDir, "docs", "context");
  try {
    return readdirSync(contextDir)
      .filter((name) => name.endsWith(".md"))
      .map((name) => `docs/context/${name}`);
  } catch {
    return [];
  }
};

export const staleReferencesCheck: DriftCheck = {
  name: "stale-references",
  description: "Living docs reference existing paths",
  requiresModel: false,
  run: (rootDir): DriftFinding => {
    const resolvedRoot = resolve(rootDir);
    const contextDocs = scanContextDir(resolvedRoot);
    const allDocs = [...LIVING_DOCS, ...contextDocs];
    const allRefs: StaleRef[] = [];
    const existsCache = new Map<string, boolean>();

    for (const doc of allDocs) {
      allRefs.push(...scanDoc(resolvedRoot, doc, existsCache));
    }

    const details = allRefs.map(
      (ref) => `${ref.doc}: references nonexistent path \`${ref.path}\``,
    );

    const passed = details.length === 0;
    return {
      check: "stale-references",
      passed,
      message: passed
        ? "All referenced paths in living docs exist"
        : `${details.length} stale reference(s) found`,
      severity: "warning",
      details,
    };
  },
};
