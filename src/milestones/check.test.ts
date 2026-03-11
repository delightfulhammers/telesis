import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkMilestoneFromInfo } from "./check.js";
import type { MilestoneInfo } from "./parse.js";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

vi.mock("../drift/checks/index.js", () => ({
  allChecks: [],
}));

vi.mock("../drift/runner.js", () => ({
  runChecks: vi.fn(),
}));

import { execSync } from "node:child_process";
import { runChecks } from "../drift/runner.js";

const mockExecSync = vi.mocked(execSync);
const mockRunChecks = vi.mocked(runChecks);

const makeInfo = (overrides?: Partial<MilestoneInfo>): MilestoneInfo => ({
  name: "v0.9.0 — Milestone Validation",
  version: "0.9.0",
  status: "In Progress",
  tddReferences: [],
  criteria: ["Check works", "Complete works"],
  raw: "",
  ...overrides,
});

describe("checkMilestoneFromInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports pass when drift/test/build/lint all succeed", () => {
    mockRunChecks.mockReturnValue({
      checks: [],
      passed: true,
      summary: { total: 0, passed: 0, failed: 0, warnings: 0 },
    });
    mockExecSync.mockReturnValue(Buffer.from(""));

    const report = checkMilestoneFromInfo(makeInfo(), "/fake");
    expect(report.passed).toBe(true);

    const autoResults = report.results.filter((r) => r.kind === "auto");
    expect(autoResults).toHaveLength(4);
    expect(autoResults.every((r) => r.passed)).toBe(true);
  });

  it("reports fail when drift check fails", () => {
    mockRunChecks.mockReturnValue({
      checks: [],
      passed: false,
      summary: { total: 1, passed: 0, failed: 1, warnings: 0 },
    });
    mockExecSync.mockReturnValue(Buffer.from(""));

    const report = checkMilestoneFromInfo(makeInfo(), "/fake");
    expect(report.passed).toBe(false);

    const driftResult = report.results.find((r) => r.name === "drift-clean");
    expect(driftResult!.passed).toBe(false);
  });

  it("reports fail when tests fail", () => {
    mockRunChecks.mockReturnValue({
      checks: [],
      passed: true,
      summary: { total: 0, passed: 0, failed: 0, warnings: 0 },
    });
    mockExecSync.mockImplementation((cmd) => {
      if (typeof cmd === "string" && cmd === "pnpm test") {
        throw new Error("tests failed");
      }
      return Buffer.from("");
    });

    const report = checkMilestoneFromInfo(makeInfo(), "/fake");
    expect(report.passed).toBe(false);

    const testResult = report.results.find((r) => r.name === "tests-pass");
    expect(testResult!.passed).toBe(false);
  });

  it("reports fail when build fails", () => {
    mockRunChecks.mockReturnValue({
      checks: [],
      passed: true,
      summary: { total: 0, passed: 0, failed: 0, warnings: 0 },
    });
    mockExecSync.mockImplementation((cmd) => {
      if (typeof cmd === "string" && cmd === "pnpm run build") {
        throw new Error("build failed");
      }
      return Buffer.from("");
    });

    const report = checkMilestoneFromInfo(makeInfo(), "/fake");
    expect(report.passed).toBe(false);
  });

  it("reports fail when lint fails", () => {
    mockRunChecks.mockReturnValue({
      checks: [],
      passed: true,
      summary: { total: 0, passed: 0, failed: 0, warnings: 0 },
    });
    mockExecSync.mockImplementation((cmd) => {
      if (typeof cmd === "string" && cmd === "pnpm run lint") {
        throw new Error("lint failed");
      }
      return Buffer.from("");
    });

    const report = checkMilestoneFromInfo(makeInfo(), "/fake");
    expect(report.passed).toBe(false);
  });

  it("lists acceptance criteria as manual items", () => {
    mockRunChecks.mockReturnValue({
      checks: [],
      passed: true,
      summary: { total: 0, passed: 0, failed: 0, warnings: 0 },
    });
    mockExecSync.mockReturnValue(Buffer.from(""));

    const report = checkMilestoneFromInfo(
      makeInfo({ criteria: ["First", "Second", "Third"] }),
      "/fake",
    );

    const manualResults = report.results.filter((r) => r.kind === "manual");
    expect(manualResults).toHaveLength(3);
    expect(manualResults[0]!.name).toBe("First");
    expect(manualResults[1]!.name).toBe("Second");
    expect(manualResults[2]!.name).toBe("Third");
  });

  it("returns overall passed=true only when all auto checks pass", () => {
    mockRunChecks.mockReturnValue({
      checks: [],
      passed: true,
      summary: { total: 0, passed: 0, failed: 0, warnings: 0 },
    });
    mockExecSync.mockReturnValue(Buffer.from(""));

    const report = checkMilestoneFromInfo(
      makeInfo({ criteria: ["Requires human judgment"] }),
      "/fake",
    );

    // Manual items don't affect overall pass
    expect(report.passed).toBe(true);
    const manualResults = report.results.filter((r) => r.kind === "manual");
    expect(manualResults[0]!.passed).toBe(false);
  });

  it("includes milestone name in report", () => {
    mockRunChecks.mockReturnValue({
      checks: [],
      passed: true,
      summary: { total: 0, passed: 0, failed: 0, warnings: 0 },
    });
    mockExecSync.mockReturnValue(Buffer.from(""));

    const report = checkMilestoneFromInfo(makeInfo(), "/fake");
    expect(report.milestone).toBe("v0.9.0 — Milestone Validation");
  });
});
