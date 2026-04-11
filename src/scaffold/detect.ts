import { existsSync } from "node:fs";
import { join } from "node:path";
import { discoverDocs } from "./doc-discovery.js";

export type InitMode = "greenfield" | "existing" | "migration";

export interface ProjectState {
  readonly mode: InitMode;
  readonly hasConfig: boolean;
  readonly existingDocs: readonly string[];
  readonly missingDocs: readonly string[];
  readonly hasClaudeDir: boolean;
}

const DOC_NAMES = [
  "VISION.md",
  "PRD.md",
  "ARCHITECTURE.md",
  "MILESTONES.md",
] as const;

/**
 * Detect the project state to determine which init mode to use.
 * Pure filesystem inspection — no LLM calls.
 *
 * First checks standard doc paths (docsDir/VISION.md, etc.). If none found,
 * falls back to recursive discovery to catch docs at non-standard locations
 * (e.g., docs/nats/ARCHITECTURE.md in a monorepo).
 */
export const detectState = (
  rootDir: string,
  docsDir: string = "docs",
): ProjectState => {
  const hasConfig = existsSync(join(rootDir, ".telesis", "config.yml"));
  const hasClaudeDir = existsSync(join(rootDir, ".claude"));

  const existingDocs: string[] = [];
  const missingDocs: string[] = [];

  for (const name of DOC_NAMES) {
    const relPath = `${docsDir}/${name}`;
    if (existsSync(join(rootDir, relPath))) {
      existingDocs.push(relPath);
    } else {
      missingDocs.push(relPath);
    }
  }

  // If no docs at standard paths, try recursive discovery as fallback
  if (existingDocs.length === 0 && !hasConfig) {
    const discovery = discoverDocs(rootDir, { readContent: false });
    const discoveredNonReadme = discovery.docs.filter(
      (d) => d.type !== "readme",
    );
    if (discoveredNonReadme.length > 0) {
      // Found docs at non-standard locations — treat as existing project
      for (const doc of discoveredNonReadme) {
        existingDocs.push(doc.relPath);
      }
    }
  }

  const mode: InitMode = hasConfig
    ? "migration"
    : existingDocs.length > 0
      ? "existing"
      : "greenfield";

  return { mode, hasConfig, existingDocs, missingDocs, hasClaudeDir };
};
