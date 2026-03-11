import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DriftCheck, DriftFinding } from "../types.js";

const CLI_VERSION_RE = /\.version\("([^"]+)"\)/;

export const cliVersionSyncCheck: DriftCheck = {
  name: "cli-version-sync",
  description: "CLI entrypoint version matches package.json",
  requiresModel: false,
  run: (rootDir): DriftFinding => {
    const pkgPath = join(rootDir, "package.json");
    const entryPath = join(rootDir, "src", "index.ts");

    if (!existsSync(pkgPath) || !existsSync(entryPath)) {
      return {
        check: "cli-version-sync",
        passed: true,
        message: "package.json or src/index.ts not found (skipped)",
        severity: "warning",
        details: [],
      };
    }

    let pkgVersion: string;
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<
        string,
        unknown
      >;
      pkgVersion = String(pkg.version ?? "");
      if (!pkgVersion) {
        return {
          check: "cli-version-sync",
          passed: true,
          message: "package.json has no version field (skipped)",
          severity: "warning",
          details: [],
        };
      }
    } catch {
      return {
        check: "cli-version-sync",
        passed: true,
        message: "Failed to parse package.json (skipped)",
        severity: "warning",
        details: [],
      };
    }

    let entryContent: string;
    try {
      entryContent = readFileSync(entryPath, "utf-8");
    } catch {
      return {
        check: "cli-version-sync",
        passed: true,
        message: "Failed to read src/index.ts (skipped)",
        severity: "warning",
        details: [],
      };
    }
    const match = CLI_VERSION_RE.exec(entryContent);

    if (!match?.[1]) {
      return {
        check: "cli-version-sync",
        passed: true,
        message: "No .version() call found in src/index.ts (skipped)",
        severity: "warning",
        details: [],
      };
    }

    const cliVersion = match[1];
    const passed = cliVersion === pkgVersion;
    return {
      check: "cli-version-sync",
      passed,
      message: passed
        ? `CLI version (${cliVersion}) matches package.json`
        : `CLI version (${cliVersion}) does not match package.json (${pkgVersion})`,
      severity: "warning",
      details: passed
        ? []
        : [
            `src/index.ts .version(): ${cliVersion}`,
            `package.json: ${pkgVersion}`,
          ],
    };
  },
};
