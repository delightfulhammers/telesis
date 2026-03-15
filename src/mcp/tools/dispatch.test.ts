import { describe, it, expect } from "vitest";
import { register } from "./dispatch.js";

describe("dispatch tool registration", () => {
  it("exports a register function", () => {
    expect(typeof register).toBe("function");
  });
});
