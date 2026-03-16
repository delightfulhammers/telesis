import { describe, it, expect } from "vitest";
import { register } from "./orchestrator.js";

describe("orchestrator tool registration", () => {
  it("exports a register function", () => {
    expect(typeof register).toBe("function");
  });
});
