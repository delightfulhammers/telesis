import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { DriftCheck, DriftFinding } from "../types.js";

/**
 * Packages that predate the TDD convention or are pure infrastructure
 * without interface boundaries. These are exempt from TDD coverage.
 *
 * The TDD discipline was formalized in v0.5.0. Packages from v0.1.0-v0.4.0
 * that are stable single-file infrastructure are grandfathered here.
 * New packages introduced after v0.5.0 are expected to have TDD coverage.
 */
const EXEMPT_PACKAGES: ReadonlySet<string> = new Set([
  // CLI / framework wiring
  "cli",
  "config",
  "templates",
  // v0.1.0 MVP — single-file infrastructure
  "adr",
  "context",
  "docgen",
  "milestones",
  "scaffold",
  "status",
  "tdd",
  // v0.3.0-v0.4.0 — stable subsystems predating TDD convention
  "eval",
  "notes",
  // v0.11.0 — pure JSONL store/format, no interface boundary
  "journal",
  // Agent infrastructure — thin wrappers
  "agent/model",
  "agent/telemetry",
]);

/**
 * Discovers packages under src/ — both top-level (src/X) and agent
 * sub-packages (src/agent/X). A directory counts as a package if it
 * contains at least one .ts file.
 */
export const discoverPackages = (rootDir: string): readonly string[] => {
  const srcDir = join(rootDir, "src");
  if (!existsSync(srcDir)) return [];

  const packages: string[] = [];

  const entries = readdirSync(srcDir);
  for (const entry of entries) {
    const fullPath = join(srcDir, entry);
    if (!statSync(fullPath).isDirectory()) continue;

    if (entry === "agent") {
      // Scan agent sub-packages
      const agentEntries = readdirSync(fullPath);
      for (const sub of agentEntries) {
        const subPath = join(fullPath, sub);
        if (!statSync(subPath).isDirectory()) continue;
        if (hasTsFiles(subPath)) {
          packages.push(`agent/${sub}`);
        }
      }
    } else {
      if (hasTsFiles(fullPath)) {
        packages.push(entry);
      }
    }
  }

  return packages;
};

const hasTsFiles = (dir: string): boolean =>
  readdirSync(dir).some(
    (f) => f.endsWith(".ts") && !f.endsWith(".d.ts") && !f.endsWith(".test.ts"),
  );

/**
 * Reads all TDD files and builds a set of src/ package references found
 * across all TDDs.
 */
const buildTddPackageIndex = (tddDir: string): ReadonlySet<string> => {
  if (!existsSync(tddDir)) return new Set();

  const referenced = new Set<string>();
  const SRC_PKG_RE = /src\/([a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)?)/g;

  const files = readdirSync(tddDir).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    const content = readFileSync(join(tddDir, file), "utf-8");
    for (const match of content.matchAll(SRC_PKG_RE)) {
      if (match[1]) {
        referenced.add(match[1]);
      }
    }
  }

  return referenced;
};

export const tddCoverageCheck: DriftCheck = {
  name: "tdd-coverage",
  description: "All non-exempt packages have TDD coverage",
  requiresModel: false,
  run: (rootDir): DriftFinding => {
    const packages = discoverPackages(rootDir);
    const tddDir = join(rootDir, "docs", "tdd");
    const tddRefs = buildTddPackageIndex(tddDir);

    const uncovered = packages.filter(
      (pkg) => !EXEMPT_PACKAGES.has(pkg) && !tddRefs.has(pkg),
    );

    const passed = uncovered.length === 0;
    return {
      check: "tdd-coverage",
      passed,
      message: passed
        ? "All non-exempt packages have TDD coverage"
        : `${uncovered.length} package(s) missing TDD coverage`,
      severity: "warning",
      details: uncovered.map(
        (pkg) => `src/${pkg}/ has no TDD referencing it in docs/tdd/`,
      ),
    };
  },
};
