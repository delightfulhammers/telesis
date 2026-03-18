import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadRawConfig } from "../../config/config.js";
import type { DriftCheck } from "../types.js";

/**
 * Directories that every Telesis-managed project should have.
 * Created by `telesis init` and expected by other commands.
 */
const DEFAULT_DIRS: readonly string[] = [
  "docs",
  "docs/adr",
  "docs/tdd",
  "docs/context",
];

/**
 * Load project-specific expected directories from .telesis/config.yml.
 * Falls back to DEFAULT_DIRS if not configured.
 */
const loadExpectedDirs = (rootDir: string): readonly string[] => {
  try {
    const raw = loadRawConfig(rootDir);
    if (
      raw &&
      typeof raw === "object" &&
      "drift" in raw &&
      raw.drift &&
      typeof raw.drift === "object"
    ) {
      const drift = raw.drift as Record<string, unknown>;
      if (Array.isArray(drift.expectedDirectories)) {
        const validDirs = drift.expectedDirectories.filter(
          (d): d is string => typeof d === "string",
        );
        // Empty array is likely misconfiguration — fall back to defaults
        if (validDirs.length === 0) return DEFAULT_DIRS;
        return validDirs;
      }
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "EACCES" || code === "EPERM") {
      // Config not found or not readable — use defaults
    } else {
      console.error(
        "[telesis] Warning: could not load config for drift check:",
        err,
      );
    }
  }
  return DEFAULT_DIRS;
};

export const expectedDirectoriesCheck: DriftCheck = {
  name: "expected-directories",
  description: "All documented directories exist in the repo",
  requiresModel: false,
  run: (rootDir) => {
    const dirs = loadExpectedDirs(rootDir);
    const missing = dirs.filter((dir) => !existsSync(join(rootDir, dir)));

    return {
      check: "expected-directories",
      passed: missing.length === 0,
      message:
        missing.length === 0
          ? "All expected directories present"
          : `${missing.length} expected directory/directories missing`,
      severity: "warning",
      details: missing.map((dir) => `Missing: ${dir}`),
    };
  },
};
