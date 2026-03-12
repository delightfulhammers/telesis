import { describe, it, expect } from "vitest";
import type { DismissalSignal, DismissalSource } from "./source.js";

describe("DismissalSource interface", () => {
  it("is implementable with the required shape", () => {
    const mockSource: DismissalSource = {
      platform: "test",
      fetchDismissals: async (): Promise<readonly DismissalSignal[]> => [],
    };

    expect(mockSource.platform).toBe("test");
    expect(typeof mockSource.fetchDismissals).toBe("function");
  });

  it("DismissalSignal carries expected fields", () => {
    const signal: DismissalSignal = {
      findingId: "abc-123",
      path: "src/foo.ts",
      description: "Some issue",
      reason: "false-positive",
      platformRef: "test:ref/1",
    };

    expect(signal.findingId).toBe("abc-123");
    expect(signal.reason).toBe("false-positive");
    expect(signal.platformRef).toContain("test:");
  });

  it("DismissalSignal findingId is optional", () => {
    const signal: DismissalSignal = {
      path: "src/bar.ts",
      description: "Another issue",
      reason: "not-actionable",
      platformRef: "github:PR#42/thread/1",
    };

    expect(signal.findingId).toBeUndefined();
  });
});
