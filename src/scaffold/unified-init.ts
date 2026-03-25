import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { detectState, type InitMode, type ProjectState } from "./detect.js";
import type { UpgradeResult } from "./upgrade.js";
import type { Config } from "../config/config.js";

/** Dependencies for the unified init orchestrator */
export interface UnifiedInitDeps {
  readonly rootDir: string;
  readonly docsDir?: string;
  /** Greenfield mode: run AI interview + doc generation (existing init flow) */
  readonly runGreenfield: () => Promise<{
    turnCount: number;
    documentsGenerated: readonly string[];
    config: Config;
  }>;
  /** Migration mode: retrofit missing scaffold artifacts */
  readonly applyMigration: (rootDir: string) => UpgradeResult;
  /** Existing mode: extract config from pre-existing docs */
  readonly extractConfigFromDocs: (
    rootDir: string,
    docsDir: string,
  ) => Promise<Config>;
  /** Persist config to .telesis/config.yml */
  readonly saveConfig: (rootDir: string, config: Config) => void;
  /** Generate CLAUDE.md from project state */
  readonly generateContext: (rootDir: string) => string;
  /** Install provider-appropriate adapter (hooks, skills, MCP config) */
  readonly installProviderAdapter: (
    rootDir: string,
    hasClaudeDir: boolean,
  ) => void;
  /** Create standard directories (docs/adr, docs/tdd, docs/context) */
  readonly scaffoldDirectories: (rootDir: string) => void;
}

export interface UnifiedInitResult {
  readonly mode: InitMode;
  readonly existingDocs: readonly string[];
  readonly missingDocs: readonly string[];
  readonly migrationResult?: UpgradeResult;
}

/**
 * Unified init: auto-detects project state and applies the appropriate mode.
 * - greenfield: AI interview + doc generation
 * - existing: ingest docs, extract config, scaffold
 * - migration: retrofit missing artifacts
 *
 * All modes end with provider adapter installation.
 */
export const runUnifiedInit = async (
  deps: UnifiedInitDeps,
): Promise<UnifiedInitResult> => {
  const state = detectState(deps.rootDir, deps.docsDir);

  let migrationResult: UpgradeResult | undefined;

  switch (state.mode) {
    case "greenfield": {
      deps.scaffoldDirectories(deps.rootDir);
      // runGreenfield owns interview, doc generation, config save, and context generation
      await deps.runGreenfield();
      break;
    }

    case "existing": {
      deps.scaffoldDirectories(deps.rootDir);
      const docsDir = deps.docsDir ?? "docs";
      const config = await deps.extractConfigFromDocs(deps.rootDir, docsDir);
      deps.saveConfig(deps.rootDir, config);
      const claudeContent = deps.generateContext(deps.rootDir);
      writeFileSync(join(deps.rootDir, "CLAUDE.md"), claudeContent);
      break;
    }

    case "migration": {
      migrationResult = deps.applyMigration(deps.rootDir);
      break;
    }
  }

  // All modes: install provider adapter
  deps.installProviderAdapter(deps.rootDir, state.hasClaudeDir);

  return {
    mode: state.mode,
    existingDocs: state.existingDocs,
    missingDocs: state.missingDocs,
    migrationResult,
  };
};
