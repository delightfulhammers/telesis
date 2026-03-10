import { describe, it, expect } from "vitest";
import { formatReport } from "./format.js";
import type { EvalReport } from "./types.js";

describe("formatReport", () => {
  it("produces human-readable output with overall score", () => {
    const report: EvalReport = {
      documents: [
        {
          document: "vision",
          overall: 0.9,
          axes: {
            completeness: 1.0,
            coverage: 0.8,
            specificity: 0.9,
            consistency: 1.0,
            actionability: 0.8,
          },
          diagnostics: [],
        },
      ],
      overall: 0.9,
      diagnostics: [],
    };

    const output = formatReport(report);

    expect(output).toContain("Document Quality Report");
    expect(output).toContain("90%");
    expect(output).toContain("VISION.md");
    expect(output).toContain("Completeness");
  });

  it("includes diagnostics in output", () => {
    const report: EvalReport = {
      documents: [],
      overall: 0.5,
      diagnostics: [
        {
          axis: "completeness",
          document: "vision",
          message: "Missing section: The Problem",
          severity: "warning",
        },
        {
          axis: "specificity",
          document: "prd",
          message: "Document is empty",
          severity: "error",
        },
      ],
    };

    const output = formatReport(report);

    expect(output).toContain("Missing section: The Problem");
    expect(output).toContain("Document is empty");
  });
});
