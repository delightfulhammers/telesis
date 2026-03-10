import { describe, it, expect } from "vitest";
import { parseJsonResponse } from "./json-parse.js";

describe("parseJsonResponse", () => {
  it("parses raw JSON", () => {
    expect(parseJsonResponse('[{"a": 1}]')).toEqual([{ a: 1 }]);
  });

  it("extracts JSON from markdown code fences", () => {
    const wrapped = '```json\n[{"a": 1}]\n```';
    expect(parseJsonResponse(wrapped)).toEqual([{ a: 1 }]);
  });

  it("handles preamble and postamble around fences", () => {
    const wrapped =
      'Here are results:\n\n```json\n[{"a": 1}]\n```\n\nLet me know.';
    expect(parseJsonResponse(wrapped)).toEqual([{ a: 1 }]);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseJsonResponse("not json")).toThrow();
  });
});
