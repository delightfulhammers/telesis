import { describe, it, expect } from "vitest";
import { register } from "./review.js";

describe("review tool registration", () => {
  it("exports a register function", () => {
    expect(typeof register).toBe("function");
  });
});
