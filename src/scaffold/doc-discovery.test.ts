import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../test-utils.js";
import { discoverDocs } from "./doc-discovery.js";

const makeTempDir = useTempDir("doc-discovery-test");

describe("discoverDocs", () => {
  describe("basic discovery", () => {
    it("finds docs at standard docs/ paths", () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, "docs"), { recursive: true });
      writeFileSync(join(dir, "docs", "ARCHITECTURE.md"), "# Arch\n");
      writeFileSync(join(dir, "docs", "PRD.md"), "# PRD\n");

      const result = discoverDocs(dir);
      expect(result.docs).toHaveLength(2);

      const types = result.docs.map((d) => d.type);
      expect(types).toContain("architecture");
      expect(types).toContain("prd");
    });

    it("finds VISION.md and MILESTONES.md", () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, "docs"), { recursive: true });
      writeFileSync(join(dir, "docs", "VISION.md"), "# Vision\n");
      writeFileSync(join(dir, "docs", "MILESTONES.md"), "# Milestones\n");

      const result = discoverDocs(dir);
      const types = result.docs.map((d) => d.type);
      expect(types).toContain("vision");
      expect(types).toContain("milestones");
    });

    it("finds DESIGN.md files", () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, "services", "config", "docs"), { recursive: true });
      writeFileSync(
        join(dir, "services", "config", "docs", "DESIGN.md"),
        "# Design\n",
      );

      const result = discoverDocs(dir);
      expect(result.docs).toHaveLength(1);
      expect(result.docs[0]!.type).toBe("design");
    });

    it("returns empty when no docs found", () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, "src"), { recursive: true });
      writeFileSync(join(dir, "src", "index.ts"), "console.log('hi');\n");

      const result = discoverDocs(dir);
      expect(result.docs).toHaveLength(0);
      expect(result.adrDirs).toHaveLength(0);
      expect(result.tddDirs).toHaveLength(0);
    });
  });

  describe("recursive discovery", () => {
    it("finds docs in nested directories", () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, "docs", "nats"), { recursive: true });
      writeFileSync(
        join(dir, "docs", "nats", "ARCHITECTURE.md"),
        "# NATS Arch\n",
      );
      writeFileSync(join(dir, "docs", "nats", "PRD.md"), "# NATS PRD\n");

      const result = discoverDocs(dir);
      expect(result.docs).toHaveLength(2);
      expect(result.docs[0]!.relPath).toMatch(/docs\/nats\//);
    });

    it("finds docs in service subdirectories", () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, "services", "config", "docs"), { recursive: true });
      writeFileSync(
        join(dir, "services", "config", "docs", "ARCHITECTURE.md"),
        "# Config Arch\n",
      );

      const result = discoverDocs(dir);
      expect(result.docs).toHaveLength(1);
      expect(result.docs[0]!.relPath).toBe(
        "services/config/docs/ARCHITECTURE.md",
      );
    });

    it("respects maxDepth option", () => {
      const dir = makeTempDir();
      // Depth 2: dir/a/b/
      mkdirSync(join(dir, "a", "b"), { recursive: true });
      writeFileSync(join(dir, "a", "b", "ARCHITECTURE.md"), "# Deep\n");
      // Depth 4: dir/a/b/c/d/
      mkdirSync(join(dir, "a", "b", "c", "d"), { recursive: true });
      writeFileSync(
        join(dir, "a", "b", "c", "d", "ARCHITECTURE.md"),
        "# Too deep\n",
      );

      const shallow = discoverDocs(dir, { maxDepth: 3 });
      expect(shallow.docs).toHaveLength(1);
      expect(shallow.docs[0]!.relPath).toBe("a/b/ARCHITECTURE.md");

      const deep = discoverDocs(dir, { maxDepth: 5 });
      expect(deep.docs).toHaveLength(2);
    });
  });

  describe("ADR and TDD directory discovery", () => {
    it("discovers ADR directories", () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, "docs", "adr"), { recursive: true });
      writeFileSync(
        join(dir, "docs", "adr", "ADR-001-something.md"),
        "# ADR\n",
      );
      writeFileSync(join(dir, "docs", "adr", "ADR-002-other.md"), "# ADR 2\n");

      const result = discoverDocs(dir);
      expect(result.adrDirs).toContain("docs/adr");
      const adrDocs = result.docs.filter((d) => d.type === "adr");
      expect(adrDocs).toHaveLength(2);
    });

    it("discovers TDD directories", () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, "docs", "tdd"), { recursive: true });
      writeFileSync(join(dir, "docs", "tdd", "TDD-001-widget.md"), "# TDD\n");

      const result = discoverDocs(dir);
      expect(result.tddDirs).toContain("docs/tdd");
      const tddDocs = result.docs.filter((d) => d.type === "tdd");
      expect(tddDocs).toHaveLength(1);
    });

    it("discovers ADR dirs at non-standard locations", () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, "docs", "nats", "adr"), { recursive: true });
      writeFileSync(
        join(dir, "docs", "nats", "adr", "ADR-003-storage.md"),
        "# Storage\n",
      );

      const result = discoverDocs(dir);
      expect(result.adrDirs).toContain("docs/nats/adr");
    });
  });

  describe("noise filtering", () => {
    it("skips node_modules", () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, "node_modules", "pkg", "docs"), { recursive: true });
      writeFileSync(
        join(dir, "node_modules", "pkg", "docs", "ARCHITECTURE.md"),
        "# Noise\n",
      );

      const result = discoverDocs(dir);
      expect(result.docs).toHaveLength(0);
    });

    it("skips .git directory", () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, ".git", "refs"), { recursive: true });
      writeFileSync(join(dir, ".git", "ARCHITECTURE.md"), "# Noise\n");

      const result = discoverDocs(dir);
      expect(result.docs).toHaveLength(0);
    });

    it("skips vendor and dist directories", () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, "vendor", "lib"), { recursive: true });
      mkdirSync(join(dir, "dist"), { recursive: true });
      writeFileSync(join(dir, "vendor", "lib", "ARCHITECTURE.md"), "# No\n");
      writeFileSync(join(dir, "dist", "ARCHITECTURE.md"), "# No\n");

      const result = discoverDocs(dir);
      expect(result.docs).toHaveLength(0);
    });

    it("does not discover random markdown files", () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, "docs"), { recursive: true });
      writeFileSync(join(dir, "docs", "CHANGELOG.md"), "# Changes\n");
      writeFileSync(join(dir, "docs", "CONTRIBUTING.md"), "# Contrib\n");
      writeFileSync(join(dir, "docs", "random-notes.md"), "# Notes\n");

      const result = discoverDocs(dir);
      expect(result.docs).toHaveLength(0);
    });
  });

  describe("content reading", () => {
    it("includes file content in results", () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, "docs"), { recursive: true });
      writeFileSync(
        join(dir, "docs", "ARCHITECTURE.md"),
        "# Architecture\n\nSome detailed content here.\n",
      );

      const result = discoverDocs(dir);
      expect(result.docs[0]!.content).toContain("Some detailed content here.");
    });

    it("truncates content to stay within maxTotalBytes", () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, "docs"), { recursive: true });
      const bigContent = "# Arch\n" + "x".repeat(50_000);
      writeFileSync(join(dir, "docs", "ARCHITECTURE.md"), bigContent);
      writeFileSync(join(dir, "docs", "PRD.md"), bigContent);

      const result = discoverDocs(dir, { maxTotalBytes: 10_000 });
      const totalBytes = result.docs.reduce(
        (sum, d) => sum + d.content.length,
        0,
      );
      expect(totalBytes).toBeLessThanOrEqual(10_000);
    });
  });

  describe("README discovery", () => {
    it("finds README.md at project root", () => {
      const dir = makeTempDir();
      writeFileSync(join(dir, "README.md"), "# My Project\n");

      const result = discoverDocs(dir);
      expect(result.docs).toHaveLength(1);
      expect(result.docs[0]!.type).toBe("readme");
      expect(result.docs[0]!.relPath).toBe("README.md");
    });

    it("finds README.md in subdirectories", () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, "services", "api"), { recursive: true });
      writeFileSync(
        join(dir, "services", "api", "README.md"),
        "# API Service\n",
      );

      const result = discoverDocs(dir);
      expect(result.docs).toHaveLength(1);
      expect(result.docs[0]!.type).toBe("readme");
    });
  });

  describe("readContent option", () => {
    it("returns empty content when readContent is false", () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, "docs"), { recursive: true });
      writeFileSync(
        join(dir, "docs", "ARCHITECTURE.md"),
        "# Arch\n\nLots of content here.\n",
      );

      const result = discoverDocs(dir, { readContent: false });
      expect(result.docs).toHaveLength(1);
      expect(result.docs[0]!.type).toBe("architecture");
      expect(result.docs[0]!.relPath).toBe("docs/ARCHITECTURE.md");
      expect(result.docs[0]!.content).toBe("");
    });

    it("still discovers directories when readContent is false", () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, "docs", "adr"), { recursive: true });
      writeFileSync(
        join(dir, "docs", "adr", "ADR-001-test.md"),
        "# ADR content\n",
      );

      const result = discoverDocs(dir, { readContent: false });
      expect(result.adrDirs).toContain("docs/adr");
      expect(result.docs[0]!.content).toBe("");
    });
  });
});
