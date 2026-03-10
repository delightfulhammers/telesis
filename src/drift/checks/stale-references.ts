import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { DriftCheck, DriftFinding } from "../types.js";

const LIVING_DOCS = [
  "docs/VISION.md",
  "docs/PRD.md",
  "docs/ARCHITECTURE.md",
  "docs/MILESTONES.md",
];

const BACKTICK_PATH_RE = /`((?:src|docs)\/[^`\s]+)`/g;
const RELATIVE_LINK_RE = /\[([^\]]*)\]\((\.[^)]+)\)/g;
const FENCE_RE = /^```/;
const TEMPLATE_PATTERN_RE = /[{}<>*]/;

interface StaleRef {
  readonly doc: string;
  readonly path: string;
}

const scanDoc = (rootDir: string, docRelPath: string): readonly StaleRef[] => {
  const docPath = join(rootDir, docRelPath);
  let content: string;
  try {
    content = readFileSync(docPath, "utf-8");
  } catch {
    return [];
  }

  const refs: StaleRef[] = [];
  const lines = content.split("\n");
  let inFence = false;

  for (const line of lines) {
    if (FENCE_RE.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    // Backtick-quoted paths
    let match: RegExpExecArray | null;
    BACKTICK_PATH_RE.lastIndex = 0;
    while ((match = BACKTICK_PATH_RE.exec(line)) !== null) {
      const refPath = match[1]!;
      if (TEMPLATE_PATTERN_RE.test(refPath)) continue;

      const cleaned = refPath.replace(/\/$/, "");
      if (!existsSync(join(rootDir, cleaned))) {
        refs.push({ doc: docRelPath, path: refPath });
      }
    }

    // Relative markdown links
    RELATIVE_LINK_RE.lastIndex = 0;
    while ((match = RELATIVE_LINK_RE.exec(line)) !== null) {
      const linkTarget = match[2]!;
      if (TEMPLATE_PATTERN_RE.test(linkTarget)) continue;

      // Resolve relative to the doc's directory
      const docDir = docRelPath.substring(0, docRelPath.lastIndexOf("/"));
      const resolved = join(rootDir, docDir, linkTarget);
      if (!existsSync(resolved)) {
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
    const contextDocs = scanContextDir(rootDir);
    const allDocs = [...LIVING_DOCS, ...contextDocs];
    const allRefs: StaleRef[] = [];

    for (const doc of allDocs) {
      allRefs.push(...scanDoc(rootDir, doc));
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
