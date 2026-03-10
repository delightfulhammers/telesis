import type { ChangedFile, PersonaDefinition } from "./types.js";
import { BUILT_IN_PERSONAS } from "./personas.js";

const DOCS_ONLY_EXTENSIONS = new Set([".md", ".txt", ".rst", ".adoc"]);
const TEST_ONLY_PATTERNS = [".test.ts", ".spec.ts", ".test.js", ".spec.js"];
const CONFIG_EXTENSIONS = new Set([".json", ".yml", ".yaml", ".toml", ".env"]);

const SMALL_DIFF_LINES = 50;

const extOf = (path: string): string => {
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot) : "";
};

const isDocsOnly = (files: readonly ChangedFile[]): boolean =>
  files.length > 0 &&
  files.every((f) => DOCS_ONLY_EXTENSIONS.has(extOf(f.path)));

const isTestOnly = (files: readonly ChangedFile[]): boolean =>
  files.length > 0 &&
  files.every((f) => TEST_ONLY_PATTERNS.some((pat) => f.path.endsWith(pat)));

const isConfigOnly = (files: readonly ChangedFile[]): boolean =>
  files.length > 0 && files.every((f) => CONFIG_EXTENSIONS.has(extOf(f.path)));

const countDiffLines = (diff: string): number => {
  let count = 0;
  let i = 0;
  while (i < diff.length) {
    count++;
    const next = diff.indexOf("\n", i);
    if (next === -1) break;
    i = next + 1;
  }
  return count;
};

export interface PersonaSelection {
  readonly personas: readonly PersonaDefinition[];
  readonly rationale: string;
}

/**
 * Selects which personas to engage based on diff content and changed files.
 * The heuristic is deterministic and fast — no LLM call.
 */
export const selectPersonas = (
  diff: string,
  files: readonly ChangedFile[],
  available: readonly PersonaDefinition[] = BUILT_IN_PERSONAS,
): PersonaSelection => {
  if (isDocsOnly(files)) {
    const arch = available.find((p) => p.slug === "architecture");
    return arch
      ? { personas: [arch], rationale: "docs-only change: architecture review" }
      : { personas: available.slice(0, 1), rationale: "docs-only change" };
  }

  if (isConfigOnly(files)) {
    const sec = available.find((p) => p.slug === "security");
    const arch = available.find((p) => p.slug === "architecture");
    const selected = [sec, arch].filter(
      (p): p is PersonaDefinition => p !== undefined,
    );
    return selected.length > 0
      ? {
          personas: selected,
          rationale: "config-only change: security + architecture review",
        }
      : { personas: available, rationale: "config-only change" };
  }

  if (isTestOnly(files)) {
    const correctness = available.find((p) => p.slug === "correctness");
    const arch = available.find((p) => p.slug === "architecture");
    const selected = [correctness, arch].filter(
      (p): p is PersonaDefinition => p !== undefined,
    );
    return selected.length > 0
      ? {
          personas: selected,
          rationale: "test-only change: correctness + architecture review",
        }
      : { personas: available, rationale: "test-only change" };
  }

  const diffLines = countDiffLines(diff);
  if (diffLines < SMALL_DIFF_LINES && available.length > 2) {
    // Small diff: skip the broadest persona to save cost
    const withoutCorrectness = available.filter(
      (p) => p.slug !== "correctness",
    );
    if (withoutCorrectness.length > 0) {
      return {
        personas: withoutCorrectness,
        rationale: `small diff (${diffLines} lines): reduced persona set`,
      };
    }
  }

  return {
    personas: available,
    rationale: "standard review: all personas",
  };
};
