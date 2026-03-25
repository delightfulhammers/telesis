import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../test-utils.js";
import { detectState } from "./detect.js";

const makeTempDir = useTempDir("detect-test");

describe("detectState", () => {
  describe("mode detection", () => {
    it("returns greenfield when no config and no docs", () => {
      const dir = makeTempDir();
      const state = detectState(dir);
      expect(state.mode).toBe("greenfield");
    });

    it("returns existing when docs exist but no .telesis/config.yml", () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, "docs"), { recursive: true });
      writeFileSync(join(dir, "docs", "PRD.md"), "# PRD\n");
      const state = detectState(dir);
      expect(state.mode).toBe("existing");
    });

    it("returns migration when .telesis/config.yml exists", () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, ".telesis"), { recursive: true });
      writeFileSync(
        join(dir, ".telesis", "config.yml"),
        "project:\n  name: Test\n",
      );
      const state = detectState(dir);
      expect(state.mode).toBe("migration");
    });

    it("returns migration even if docs also exist", () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, ".telesis"), { recursive: true });
      writeFileSync(
        join(dir, ".telesis", "config.yml"),
        "project:\n  name: Test\n",
      );
      mkdirSync(join(dir, "docs"), { recursive: true });
      writeFileSync(join(dir, "docs", "PRD.md"), "# PRD\n");
      const state = detectState(dir);
      expect(state.mode).toBe("migration");
    });
  });

  describe("doc inventory", () => {
    it("lists existing docs", () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, "docs"), { recursive: true });
      writeFileSync(join(dir, "docs", "PRD.md"), "# PRD\n");
      writeFileSync(join(dir, "docs", "VISION.md"), "# Vision\n");
      const state = detectState(dir);
      expect(state.existingDocs).toContain("docs/PRD.md");
      expect(state.existingDocs).toContain("docs/VISION.md");
    });

    it("lists missing docs", () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, "docs"), { recursive: true });
      writeFileSync(join(dir, "docs", "PRD.md"), "# PRD\n");
      const state = detectState(dir);
      expect(state.missingDocs).toContain("docs/VISION.md");
      expect(state.missingDocs).toContain("docs/ARCHITECTURE.md");
      expect(state.missingDocs).toContain("docs/MILESTONES.md");
      expect(state.missingDocs).not.toContain("docs/PRD.md");
    });

    it("reports all docs missing for greenfield", () => {
      const dir = makeTempDir();
      const state = detectState(dir);
      expect(state.existingDocs).toHaveLength(0);
      expect(state.missingDocs).toHaveLength(4);
    });
  });

  describe("provider detection", () => {
    it("detects Claude Code when .claude/ exists", () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, ".claude"), { recursive: true });
      const state = detectState(dir);
      expect(state.hasClaudeDir).toBe(true);
    });

    it("reports no Claude Code when .claude/ absent", () => {
      const dir = makeTempDir();
      const state = detectState(dir);
      expect(state.hasClaudeDir).toBe(false);
    });
  });

  describe("custom docs directory", () => {
    it("searches custom path when provided", () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, "documentation"), { recursive: true });
      writeFileSync(join(dir, "documentation", "PRD.md"), "# PRD\n");
      const state = detectState(dir, "documentation");
      expect(state.existingDocs).toContain("documentation/PRD.md");
    });
  });
});
