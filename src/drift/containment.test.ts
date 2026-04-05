import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../test-utils.js";
import { buildContainmentChecks } from "./containment.js";
import type { DriftDriftContainmentRule } from "../config/config.js";

const makeTempDir = useTempDir("containment");

/** Create a project structure with source files */
const makeProject = (files: Record<string, string>): string => {
  const root = makeTempDir();
  const srcDir = join(root, "src");
  mkdirSync(srcDir, { recursive: true });

  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(srcDir, path);
    mkdirSync(join(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, content);
  }

  return root;
};

describe("buildContainmentChecks", () => {
  it("generates a DriftCheck for each rule", () => {
    const rules: DriftContainmentRule[] = [
      { import: "express", allowedIn: ["src/api/"] },
      { import: "pg", allowedIn: ["src/db/"] },
    ];
    const checks = buildContainmentChecks(rules);
    expect(checks).toHaveLength(2);
    expect(checks[0].name).toBe("containment:express");
    expect(checks[1].name).toBe("containment:pg");
  });

  it("passes when import is only in allowed paths", () => {
    const root = makeProject({
      "db/client.ts": 'import { Pool } from "pg";\n',
      "api/server.ts": 'import express from "express";\n',
    });

    const rules: DriftContainmentRule[] = [
      { import: "pg", allowedIn: ["src/db/"] },
    ];
    const checks = buildContainmentChecks(rules);
    const result = checks[0].run(root);

    expect(result.passed).toBe(true);
    expect(result.details).toHaveLength(0);
  });

  it("fails when import is in a disallowed path", () => {
    const root = makeProject({
      "db/client.ts": 'import { Pool } from "pg";\n',
      "api/server.ts": 'import { Pool } from "pg";\n',
    });

    const rules: DriftContainmentRule[] = [
      { import: "pg", allowedIn: ["src/db/"] },
    ];
    const checks = buildContainmentChecks(rules);
    const result = checks[0].run(root);

    expect(result.passed).toBe(false);
    expect(result.details).toHaveLength(1);
    expect(result.details[0]).toContain("api/server.ts");
  });

  it("supports multiple allowedIn prefixes", () => {
    const root = makeProject({
      "api/server.ts": 'import express from "express";\n',
      "middleware/auth.ts": 'import express from "express";\n',
      "utils/helper.ts": 'import express from "express";\n',
    });

    const rules: DriftContainmentRule[] = [
      { import: "express", allowedIn: ["src/api/", "src/middleware/"] },
    ];
    const checks = buildContainmentChecks(rules);
    const result = checks[0].run(root);

    expect(result.passed).toBe(false);
    expect(result.details).toHaveLength(1);
    expect(result.details[0]).toContain("utils/helper.ts");
  });

  it("excludes test files by default", () => {
    const root = makeProject({
      "db/client.ts": 'import { Pool } from "pg";\n',
      "api/server.test.ts": 'import { Pool } from "pg";\n',
    });

    const rules: DriftContainmentRule[] = [
      { import: "pg", allowedIn: ["src/db/"] },
    ];
    const checks = buildContainmentChecks(rules);
    const result = checks[0].run(root);

    expect(result.passed).toBe(true);
  });

  it("includes test files when excludeTests is false", () => {
    const root = makeProject({
      "db/client.ts": 'import { Pool } from "pg";\n',
      "api/server.test.ts": 'import { Pool } from "pg";\n',
    });

    const rules: DriftContainmentRule[] = [
      { import: "pg", allowedIn: ["src/db/"], excludeTests: false },
    ];
    const checks = buildContainmentChecks(rules);
    const result = checks[0].run(root);

    expect(result.passed).toBe(false);
    expect(result.details).toHaveLength(1);
    expect(result.details[0]).toContain("server.test.ts");
  });

  it("uses custom severity", () => {
    const root = makeProject({
      "api/server.ts": 'import { Pool } from "pg";\n',
    });

    const rules: DriftContainmentRule[] = [
      { import: "pg", allowedIn: ["src/db/"], severity: "warning" },
    ];
    const checks = buildContainmentChecks(rules);
    const result = checks[0].run(root);

    expect(result.severity).toBe("warning");
  });

  it("defaults severity to error", () => {
    const root = makeProject({
      "api/server.ts": 'import { Pool } from "pg";\n',
    });

    const rules: DriftContainmentRule[] = [
      { import: "pg", allowedIn: ["src/db/"] },
    ];
    const checks = buildContainmentChecks(rules);
    const result = checks[0].run(root);

    expect(result.severity).toBe("error");
  });

  it("uses custom description", () => {
    const rules: DriftContainmentRule[] = [
      {
        import: "pg",
        allowedIn: ["src/db/"],
        description: "DB driver is isolated",
      },
    ];
    const checks = buildContainmentChecks(rules);
    expect(checks[0].description).toBe("DB driver is isolated");
  });

  it("auto-generates description when not provided", () => {
    const rules: DriftContainmentRule[] = [
      { import: "pg", allowedIn: ["src/db/"] },
    ];
    const checks = buildContainmentChecks(rules);
    expect(checks[0].description).toContain("pg");
    expect(checks[0].description).toContain("src/db/");
  });

  it("matches Go bare import syntax", () => {
    const root = makeProject({
      "handler/api.go": '\t"database/sql"\n',
      "db/conn.go": '\t"database/sql"\n',
    });

    const rules: DriftContainmentRule[] = [
      { import: "database/sql", allowedIn: ["src/db/"] },
    ];
    const checks = buildContainmentChecks(rules);
    const result = checks[0].run(root);

    expect(result.passed).toBe(false);
    expect(result.details).toHaveLength(1);
    expect(result.details[0]).toContain("handler/api.go");
  });

  it("matches require() syntax", () => {
    const root = makeProject({
      "api/server.js": 'const express = require("express");\n',
    });

    const rules: DriftContainmentRule[] = [
      { import: "express", allowedIn: ["src/middleware/"] },
    ];
    const checks = buildContainmentChecks(rules);
    const result = checks[0].run(root);

    expect(result.passed).toBe(false);
  });

  it("escapes special regex characters in import pattern", () => {
    const root = makeProject({
      "api/server.ts": 'import sdk from "@aws-sdk/client-s3";\n',
    });

    const rules: DriftContainmentRule[] = [
      { import: "@aws-sdk/client-s3", allowedIn: ["src/storage/"] },
    ];
    const checks = buildContainmentChecks(rules);
    const result = checks[0].run(root);

    expect(result.passed).toBe(false);
    expect(result.details[0]).toContain("api/server.ts");
  });

  it("returns empty checks for empty rules", () => {
    const checks = buildContainmentChecks([]);
    expect(checks).toHaveLength(0);
  });
});
