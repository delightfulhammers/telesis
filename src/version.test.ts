import { describe, it, expect } from "vitest";
import { VERSION } from "./version.js";

describe("version", () => {
  it("exports a semver string", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
