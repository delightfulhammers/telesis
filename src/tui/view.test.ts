import { describe, it, expect } from "vitest";

// View is a pure interface with no runtime logic.
// This file exists for test-colocation compliance.

describe("view", () => {
  it("module exports View type", async () => {
    const mod = await import("./view.js");
    // Interface-only module — verify it loads without error
    expect(mod).toBeDefined();
  });
});
