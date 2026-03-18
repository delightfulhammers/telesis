import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  copyFileSync,
  existsSync,
  renameSync,
  chmodSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { join, dirname, basename, resolve } from "node:path";
import { tmpdir } from "node:os";
import { VERSION } from "../version.js";

const REPO = "delightfulhammers/telesis";
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

export interface VersionCheck {
  readonly currentVersion: string;
  readonly latestVersion: string;
  readonly updateAvailable: boolean;
}

export interface UpdateResult extends VersionCheck {
  readonly updated: boolean;
  readonly error?: string;
}

const detectPlatform = (): { os: string; arch: string } => {
  const os = process.platform === "darwin" ? "darwin" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return { os, arch };
};

const getCurrentVersion = (): string => VERSION;

/**
 * Check the latest release version from GitHub.
 */
export const checkLatestVersion = async (): Promise<string> => {
  const response = await fetch(
    `https://api.github.com/repos/${REPO}/releases/latest`,
    {
      headers: { Accept: "application/vnd.github.v3+json" },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to check latest version: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as Record<string, unknown>;
  if (typeof data.tag_name !== "string") {
    throw new Error("Unexpected response from GitHub releases API");
  }

  const version = data.tag_name.replace(/^v/, "");
  if (!SEMVER_RE.test(version)) {
    throw new Error(`Invalid version format from GitHub: ${version}`);
  }

  return version;
};

/**
 * Check if an update is available.
 */
export const checkForUpdate = async (): Promise<VersionCheck> => {
  const currentVersion = getCurrentVersion();
  const latestVersion = await checkLatestVersion();

  return {
    currentVersion,
    latestVersion,
    updateAvailable: latestVersion !== currentVersion,
  };
};

/**
 * Download and install the latest version.
 */
export const performUpdate = async (): Promise<UpdateResult> => {
  const check = await checkForUpdate();

  if (!check.updateAvailable) {
    return { ...check, updated: false };
  }

  // Guard: only self-update when running as compiled binary (not bun/node runtime)
  const currentBinary = process.execPath;
  const binaryName = basename(currentBinary);
  if (binaryName === "bun" || binaryName === "node") {
    return {
      ...check,
      updated: false,
      error:
        "Self-update is only available in the compiled binary. Build with `pnpm run build` first.",
    };
  }

  const installDir = dirname(currentBinary);
  const { os, arch } = detectPlatform();
  const tag = `v${check.latestVersion}`;
  const archiveName = `telesis-${tag}-${os}-${arch}.tar.gz`;
  const url = `https://github.com/${REPO}/releases/download/${tag}/${archiveName}`;

  const tmpDir = mkdtempSync(join(tmpdir(), "telesis-update-"));

  try {
    // Download archive using fetch (no curl subprocess)
    const response = await fetch(url);
    if (!response.ok) {
      return {
        ...check,
        updated: false,
        error: `Download failed: ${response.status} ${response.statusText}`,
      };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const archivePath = join(tmpDir, archiveName);
    writeFileSync(archivePath, buffer);

    // Extract (tar is universally available on macOS/Linux)
    execFileSync("tar", ["-xzf", archivePath, "-C", tmpDir], {
      stdio: "pipe",
    });

    // Construct expected extract dir and validate it's under tmpDir
    const extractDirName = `telesis-${tag}-${os}-${arch}`;
    const extractDir = resolve(join(tmpDir, extractDirName));
    if (!extractDir.startsWith(resolve(tmpDir) + "/")) {
      return {
        ...check,
        updated: false,
        error: "Path traversal detected in archive",
      };
    }

    // Validate all binaries exist before replacing any
    const binaries = ["telesis", "telesis-mcp"];
    for (const bin of binaries) {
      if (!existsSync(join(extractDir, bin))) {
        return {
          ...check,
          updated: false,
          error: `Archive missing binary: ${bin}`,
        };
      }
    }

    // Two-phase replacement: stage all .new files first, then rename all.
    // If staging fails, no binaries have been replaced. If rename fails,
    // .new files can be cleaned up.
    const staged: Array<{ tmp: string; dest: string }> = [];
    for (const bin of binaries) {
      const src = join(extractDir, bin);
      const dest = join(installDir, bin);
      try {
        const tmp = `${dest}.new`;
        copyFileSync(src, tmp);
        chmodSync(tmp, 0o755);
        staged.push({ tmp, dest });
      } catch (err) {
        // Clean up any staged files on failure
        for (const s of staged) {
          try {
            rmSync(s.tmp);
          } catch {
            /* best-effort */
          }
        }
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "EACCES") {
          return {
            ...check,
            updated: false,
            error: `Permission denied writing to ${installDir}. Try: sudo telesis update`,
          };
        }
        return {
          ...check,
          updated: false,
          error: `Failed to stage ${bin}: ${err instanceof Error ? err.message : err}`,
        };
      }
    }

    // Commit: rename all staged files into place
    for (const s of staged) {
      renameSync(s.tmp, s.dest);
    }

    return { ...check, updated: true };
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
};
