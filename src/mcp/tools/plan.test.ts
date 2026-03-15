import { describe, it, expect } from "vitest";
import { register } from "./plan.js";

describe("plan tool registration", () => {
  it("exports a register function", () => {
    expect(typeof register).toBe("function");
  });
});
