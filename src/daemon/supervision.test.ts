import { describe, it, expect } from "vitest";
import {
  generateLaunchAgentPlist,
  generateSystemdUnit,
  launchAgentFilename,
  systemdUnitFilename,
} from "./supervision.js";

describe("supervision", () => {
  describe("generateLaunchAgentPlist", () => {
    it("produces valid plist with correct arguments", () => {
      const plist = generateLaunchAgentPlist(
        "/Users/dev/myproject",
        "/usr/local/bin/telesis",
      );

      expect(plist).toContain("<?xml version=");
      expect(plist).toContain("<string>/usr/local/bin/telesis</string>");
      expect(plist).toContain("<string>daemon</string>");
      expect(plist).toContain("<string>__run</string>");
      expect(plist).toContain("<string>/Users/dev/myproject</string>");
      expect(plist).toContain("<true/>");
    });

    it("includes log file paths", () => {
      const plist = generateLaunchAgentPlist(
        "/Users/dev/myproject",
        "/usr/local/bin/telesis",
      );

      expect(plist).toContain("daemon.stdout.log");
      expect(plist).toContain("daemon.stderr.log");
    });

    it("escapes XML special characters", () => {
      const plist = generateLaunchAgentPlist(
        "/Users/dev/my&project",
        "/usr/local/bin/telesis",
      );

      expect(plist).toContain("&amp;");
      expect(plist).not.toContain("my&project");
    });
  });

  describe("generateSystemdUnit", () => {
    it("produces valid unit file", () => {
      const unit = generateSystemdUnit(
        "/home/dev/myproject",
        "/usr/local/bin/telesis",
      );

      expect(unit).toContain("[Unit]");
      expect(unit).toContain("[Service]");
      expect(unit).toContain("[Install]");
      expect(unit).toContain("ExecStart=/usr/local/bin/telesis daemon __run");
      expect(unit).toContain("WorkingDirectory=/home/dev/myproject");
      expect(unit).toContain("Restart=on-failure");
    });

    it("includes log file paths", () => {
      const unit = generateSystemdUnit(
        "/home/dev/myproject",
        "/usr/local/bin/telesis",
      );

      expect(unit).toContain("daemon.stdout.log");
      expect(unit).toContain("daemon.stderr.log");
    });

    it("escapes percent signs for systemd specifiers", () => {
      const unit = generateSystemdUnit(
        "/home/dev/my%project",
        "/usr/local/bin/telesis",
      );

      expect(unit).toContain("my%%project");
      expect(unit).not.toMatch(/my%p/);
    });

    it("quotes paths with spaces", () => {
      const unit = generateSystemdUnit(
        "/home/dev/my project",
        "/usr/local/bin/telesis",
      );

      expect(unit).toContain('WorkingDirectory="/home/dev/my project"');
    });
  });

  describe("filenames", () => {
    it("generates valid LaunchAgent filename", () => {
      const name = launchAgentFilename("/Users/dev/myproject");
      expect(name).toMatch(/^com\.delightfulhammers\.telesis\..+\.plist$/);
    });

    it("generates valid systemd unit filename", () => {
      const name = systemdUnitFilename("/home/dev/myproject");
      expect(name).toMatch(/^telesis-.+\.service$/);
    });

    it("sanitizes special characters in path", () => {
      const name = launchAgentFilename("/Users/dev/my project!");
      expect(name).not.toMatch(/[ !]/);
    });
  });
});
