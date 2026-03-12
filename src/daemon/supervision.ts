import { homedir } from "node:os";
import { join, basename } from "node:path";

/** Generate a macOS LaunchAgent plist for the daemon */
export const generateLaunchAgentPlist = (
  rootDir: string,
  binaryPath: string,
): string => {
  const label = `com.delightfulhammers.telesis.${sanitizeLabel(rootDir)}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(binaryPath)}</string>
    <string>daemon</string>
    <string>__run</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${escapeXml(rootDir)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(join(rootDir, ".telesis", "daemon.stdout.log"))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(join(rootDir, ".telesis", "daemon.stderr.log"))}</string>
</dict>
</plist>
`;
};

/** Escape a path for systemd unit files.
 *  Systemd uses its own specifier syntax (% sequences). Literal % must be doubled.
 *  Paths with spaces or special chars are double-quoted with backslash escapes. */
const escapeSystemdPath = (p: string): string => {
  const escaped = p.replace(/%/g, "%%");
  return /[\s"\\]/.test(escaped)
    ? `"${escaped.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
    : escaped;
};

/** Generate a systemd user unit file for the daemon */
export const generateSystemdUnit = (
  rootDir: string,
  binaryPath: string,
): string => `[Unit]
Description=Telesis Daemon (${basename(rootDir).replace(/%/g, "%%")})
After=default.target

[Service]
Type=simple
ExecStart=${escapeSystemdPath(binaryPath)} daemon __run
WorkingDirectory=${escapeSystemdPath(rootDir)}
Restart=on-failure
RestartSec=5
StandardOutput=append:${escapeSystemdPath(join(rootDir, ".telesis", "daemon.stdout.log"))}
StandardError=append:${escapeSystemdPath(join(rootDir, ".telesis", "daemon.stderr.log"))}

[Install]
WantedBy=default.target
`;

/** LaunchAgent plist filename for a project */
export const launchAgentFilename = (rootDir: string): string =>
  `com.delightfulhammers.telesis.${sanitizeLabel(rootDir)}.plist`;

/** LaunchAgent plist destination directory */
export const launchAgentDir = (): string =>
  join(homedir(), "Library", "LaunchAgents");

/** Systemd unit filename for a project */
export const systemdUnitFilename = (rootDir: string): string =>
  `telesis-${sanitizeLabel(rootDir)}.service`;

/** Systemd user unit destination directory */
export const systemdUnitDir = (): string =>
  join(homedir(), ".config", "systemd", "user");

/** Sanitize a path into a valid label component */
const sanitizeLabel = (rootDir: string): string =>
  rootDir
    .replace(/^\//, "")
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/-$/, "")
    .toLowerCase();

/** Escape special XML characters */
const escapeXml = (str: string): string =>
  str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
