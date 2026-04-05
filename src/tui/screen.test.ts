import { describe, it, expect } from "vitest";

// Screen is mostly terminal I/O (raw mode, stdout writes) that cannot be
// unit tested without a real TTY. The createScreen factory is tested
// indirectly through app.test.ts which uses a mock screen.
// This file exists for test-colocation compliance.

describe("screen", () => {
  it("module exports createScreen", async () => {
    const mod = await import("./screen.js");
    expect(typeof mod.createScreen).toBe("function");
  });
});
