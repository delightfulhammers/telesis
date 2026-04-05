import { describe, it, expect } from "vitest";
import { createPipelineView } from "./pipeline.js";

describe("createPipelineView", () => {
  it("creates a view named Pipeline", () => {
    const view = createPipelineView({ loadState: () => null });
    expect(view.name).toBe("Pipeline");
  });

  it("renders empty state without throwing", () => {
    const view = createPipelineView({ loadState: () => null });
    const lines: string[] = [];
    const mockScreen = {
      rows: 24,
      cols: 80,
      writeLine: (_row: number, text: string) => lines.push(text),
    };
    view.render(mockScreen as never, 0, 20);
    expect(lines.length).toBeGreaterThan(0);
  });

  it("renders active pipeline state", () => {
    const view = createPipelineView({
      loadState: () => ({
        workItemTitle: "Fix auth bug",
        currentStage: "executing",
        branch: "telesis/fix-auth",
        qualityGates: [
          { name: "lint", passed: true },
          { name: "test", passed: false, message: "3 failures" },
          { name: "build", passed: null },
        ],
        reviewSummary: { findings: 5, highOrCritical: 2 },
      }),
    });

    const lines: string[] = [];
    const mockScreen = {
      rows: 24,
      cols: 80,
      writeLine: (_row: number, text: string) => lines.push(text),
    };
    view.render(mockScreen as never, 0, 20);
    expect(lines.some((l) => l.includes("Fix auth bug"))).toBe(true);
    expect(lines.some((l) => l.includes("executing"))).toBe(true);
  });

  it("refreshes on r key", () => {
    let callCount = 0;
    const view = createPipelineView({
      loadState: () => {
        callCount++;
        return null;
      },
    });

    view.onKey({
      name: "r",
      ctrl: false,
      shift: false,
      raw: Buffer.alloc(0),
    });
    expect(callCount).toBe(2); // initial + refresh
  });
});
