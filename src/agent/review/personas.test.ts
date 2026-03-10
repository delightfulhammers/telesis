import { describe, it, expect } from "vitest";
import {
  BUILT_IN_PERSONAS,
  findPersona,
  resolvePersonaSlugs,
  applyPersonaOverrides,
  securityPersona,
  architecturePersona,
  correctnessPersona,
} from "./personas.js";

describe("BUILT_IN_PERSONAS", () => {
  it("contains three personas", () => {
    expect(BUILT_IN_PERSONAS).toHaveLength(3);
  });

  it("has unique slugs", () => {
    const slugs = BUILT_IN_PERSONAS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("each persona has required fields", () => {
    for (const persona of BUILT_IN_PERSONAS) {
      expect(persona.slug).toBeTruthy();
      expect(persona.name).toBeTruthy();
      expect(persona.preamble).toBeTruthy();
      expect(persona.focusCategories.length).toBeGreaterThan(0);
    }
  });

  it("exports individual personas matching built-in list", () => {
    expect(BUILT_IN_PERSONAS).toContain(securityPersona);
    expect(BUILT_IN_PERSONAS).toContain(architecturePersona);
    expect(BUILT_IN_PERSONAS).toContain(correctnessPersona);
  });
});

describe("findPersona", () => {
  it("finds a persona by slug", () => {
    expect(findPersona("security")).toBe(securityPersona);
    expect(findPersona("architecture")).toBe(architecturePersona);
    expect(findPersona("correctness")).toBe(correctnessPersona);
  });

  it("returns undefined for unknown slug", () => {
    expect(findPersona("nonexistent")).toBeUndefined();
  });

  it("searches a custom persona list", () => {
    const custom = [{ ...securityPersona, slug: "custom-sec" }];
    expect(findPersona("custom-sec", custom)).toBe(custom[0]);
    expect(findPersona("security", custom)).toBeUndefined();
  });
});

describe("resolvePersonaSlugs", () => {
  it("resolves valid slugs to persona definitions", () => {
    const result = resolvePersonaSlugs(["security", "correctness"]);
    expect(result).toEqual([securityPersona, correctnessPersona]);
  });

  it("preserves ordering from input slugs", () => {
    const result = resolvePersonaSlugs([
      "correctness",
      "architecture",
      "security",
    ]);
    expect(result.map((p) => p.slug)).toEqual([
      "correctness",
      "architecture",
      "security",
    ]);
  });

  it("throws for unknown slugs with actionable message", () => {
    expect(() => resolvePersonaSlugs(["security", "bad", "worse"])).toThrow(
      "Unknown persona(s): bad, worse",
    );
  });

  it("includes available personas in error message", () => {
    try {
      resolvePersonaSlugs(["bad"]);
    } catch (err) {
      expect((err as Error).message).toContain("Available:");
      expect((err as Error).message).toContain("security");
    }
  });

  it("resolves against a custom persona list", () => {
    const custom = [{ ...securityPersona, slug: "sec" }];
    const result = resolvePersonaSlugs(["sec"], custom);
    expect(result).toEqual(custom);
  });
});

describe("applyPersonaOverrides", () => {
  it("applies model override to matching persona", () => {
    const result = applyPersonaOverrides(BUILT_IN_PERSONAS, [
      { slug: "security", model: "claude-opus-4-6" },
    ]);
    expect(result.find((p) => p.slug === "security")?.model).toBe(
      "claude-opus-4-6",
    );
    // Others unchanged
    expect(
      result.find((p) => p.slug === "architecture")?.model,
    ).toBeUndefined();
  });

  it("leaves personas unchanged when no overrides match", () => {
    const result = applyPersonaOverrides(BUILT_IN_PERSONAS, [
      { slug: "nonexistent", model: "claude-opus-4-6" },
    ]);
    expect(result).toEqual(BUILT_IN_PERSONAS);
  });

  it("returns identical personas when overrides list is empty", () => {
    const result = applyPersonaOverrides(BUILT_IN_PERSONAS, []);
    expect(result).toEqual(BUILT_IN_PERSONAS);
  });

  it("does not set model when override model is undefined", () => {
    const result = applyPersonaOverrides(BUILT_IN_PERSONAS, [
      { slug: "security" },
    ]);
    expect(result.find((p) => p.slug === "security")?.model).toBeUndefined();
  });
});
