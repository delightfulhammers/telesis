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

  it("extracts JSON array from prose", () => {
    const prose =
      'Based on the event digest, here are the findings:\n[{"severity":"warning","summary":"test"}]\nThat is all.';
    const result = parseJsonResponse(prose) as unknown[];
    expect(result).toHaveLength(1);
    expect((result[0] as Record<string, unknown>).severity).toBe("warning");
  });

  it("extracts JSON object from prose when no top-level array exists", () => {
    const prose = 'The result is: {"status":"ok","count":5}.';
    const result = parseJsonResponse(prose) as Record<string, unknown>;
    expect(result.status).toBe("ok");
    expect(result.count).toBe(5);
  });

  it("handles empty array in prose", () => {
    const prose = "I found no issues.\n[]";
    expect(parseJsonResponse(prose)).toEqual([]);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseJsonResponse("not json")).toThrow();
  });
});
