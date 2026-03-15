import { describe, it, expect } from "vitest";
import { register } from "./tdd.js";

describe("tdd tool registration", () => {
  it("exports a register function", () => {
    expect(typeof register).toBe("function");
  });
});
