import { describe, it, expect } from "vitest";
import { selectPersonas } from "./orchestrator.js";
import {
  BUILT_IN_PERSONAS,
  securityPersona,
  architecturePersona,
  correctnessPersona,
} from "./personas.js";
import type { ChangedFile } from "./types.js";

const file = (
  path: string,
  status: ChangedFile["status"] = "modified",
): ChangedFile => ({ path, status });

describe("selectPersonas", () => {
  it("selects all personas for standard source changes", () => {
    const result = selectPersonas("a\n".repeat(100), [
      file("src/foo.ts"),
      file("src/bar.ts"),
    ]);
    expect(result.personas).toEqual(BUILT_IN_PERSONAS);
    expect(result.rationale).toContain("all personas");
  });

  it("selects only architecture for docs-only changes", () => {
    const result = selectPersonas("+ some docs\n", [
      file("docs/README.md"),
      file("CHANGELOG.md"),
    ]);
    expect(result.personas).toEqual([architecturePersona]);
    expect(result.rationale).toContain("docs-only");
  });

  it("selects security + architecture for config-only changes", () => {
    const result = selectPersonas("+ key: value\n", [
      file(".telesis/config.yml"),
      file("package.json"),
    ]);
    expect(result.personas).toEqual([securityPersona, architecturePersona]);
    expect(result.rationale).toContain("config-only");
  });

  it("selects correctness + architecture for test-only changes", () => {
    const result = selectPersonas("+ expect(true)\n", [
      file("src/foo.test.ts"),
      file("src/bar.test.ts"),
    ]);
    expect(result.personas).toEqual([correctnessPersona, architecturePersona]);
    expect(result.rationale).toContain("test-only");
  });

  it("reduces personas for small diffs", () => {
    const result = selectPersonas("+ one line\n", [file("src/foo.ts")]);
    expect(result.personas.length).toBeLessThan(BUILT_IN_PERSONAS.length);
    expect(result.rationale).toContain("small diff");
    // Should drop correctness (broadest) but keep security + architecture
    expect(result.personas).toContain(securityPersona);
    expect(result.personas).toContain(architecturePersona);
  });

  it("uses all personas for large diffs", () => {
    const largeDiff = "a\n".repeat(200);
    const result = selectPersonas(largeDiff, [file("src/big.ts")]);
    expect(result.personas).toEqual(BUILT_IN_PERSONAS);
  });

  it("accepts custom persona lists", () => {
    const custom = [securityPersona, correctnessPersona];
    const result = selectPersonas(
      "+ code\n".repeat(100),
      [file("src/x.ts")],
      custom,
    );
    expect(result.personas).toEqual(custom);
  });

  it("handles mixed file types as standard", () => {
    const result = selectPersonas("+ mixed\n".repeat(100), [
      file("src/foo.ts"),
      file("docs/README.md"),
    ]);
    expect(result.personas).toEqual(BUILT_IN_PERSONAS);
  });
});
