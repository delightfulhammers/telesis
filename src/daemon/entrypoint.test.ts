import { describe, it, expect } from "vitest";
import { runDaemon } from "./entrypoint.js";

describe("runDaemon", () => {
  it("is a function", () => {
    expect(typeof runDaemon).toBe("function");
  });
});
