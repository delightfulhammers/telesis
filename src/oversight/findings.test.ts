import { describe, it, expect } from "vitest";
import { isValidRawFinding, parseFindings } from "./findings.js";

describe("isValidRawFinding", () => {
  it("accepts valid finding", () => {
    expect(isValidRawFinding({ severity: "warning", summary: "Issue" })).toBe(
      true,
    );
  });

  it("rejects missing summary", () => {
    expect(isValidRawFinding({ severity: "warning" })).toBe(false);
  });

  it("rejects non-object", () => {
    expect(isValidRawFinding("string")).toBe(false);
    expect(isValidRawFinding(null)).toBe(false);
  });
});

describe("parseFindings", () => {
  it("parses valid findings with correct observer name", () => {
    const raw = [
      { severity: "warning", summary: "Issue A", detail: "Details" },
      { severity: "critical", summary: "Issue B" },
    ];

    const findings = parseFindings(raw, "reviewer", "session-1", 10);

    expect(findings).toHaveLength(2);
    expect(findings[0]!.observer).toBe("reviewer");
    expect(findings[0]!.severity).toBe("warning");
    expect(findings[0]!.summary).toBe("Issue A");
    expect(findings[1]!.severity).toBe("critical");
  });

  it("defaults invalid severity to info", () => {
    const findings = parseFindings(
      [{ severity: "bogus", summary: "Test" }],
      "architect",
      "s1",
      5,
    );
    expect(findings[0]!.severity).toBe("info");
  });

  it("skips invalid entries", () => {
    const findings = parseFindings(
      [null, "string", { severity: "warning", summary: "Valid" }],
      "reviewer",
      "s1",
      3,
    );
    expect(findings).toHaveLength(1);
  });

  it("truncates long summaries", () => {
    const findings = parseFindings(
      [{ severity: "info", summary: "A".repeat(200) }],
      "reviewer",
      "s1",
      1,
    );
    expect(findings[0]!.summary.length).toBe(120);
  });
});
