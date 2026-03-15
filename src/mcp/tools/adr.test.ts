import { describe, it, expect } from "vitest";
import { register } from "./adr.js";

describe("adr tool registration", () => {
  it("exports a register function", () => {
    expect(typeof register).toBe("function");
  });
});
