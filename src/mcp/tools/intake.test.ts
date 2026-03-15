import { describe, it, expect } from "vitest";
import { register } from "./intake.js";

describe("intake tool registration", () => {
  it("exports a register function", () => {
    expect(typeof register).toBe("function");
  });
});
