import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../test-utils.js";
import {
  parsePolicy,
  loadPolicy,
  loadAllPolicies,
  splitFrontmatter,
} from "./policy.js";

const makeTempDir = useTempDir("oversight-policy");

const VALID_POLICY = `---
name: reviewer
version: 1
enabled: true
autonomy: alert
trigger: periodic
intervalEvents: 5
model: claude-sonnet-4-6
---

## Role
You are the Reviewer observer.
`;

describe("splitFrontmatter", () => {
  it("splits frontmatter from body", () => {
    const result = splitFrontmatter(VALID_POLICY);
    expect(result.frontmatter).toContain("name: reviewer");
    expect(result.body).toContain("## Role");
  });

  it("returns empty frontmatter when no delimiters", () => {
    const result = splitFrontmatter("just a body");
    expect(result.frontmatter).toBe("");
    expect(result.body).toBe("just a body");
  });

  it("returns empty frontmatter when missing closing delimiter", () => {
    const result = splitFrontmatter("---\nname: test\nbody here");
    expect(result.frontmatter).toBe("");
  });
});

describe("parsePolicy", () => {
  it("parses a valid policy file", () => {
    const policy = parsePolicy(VALID_POLICY);
    expect(policy.name).toBe("reviewer");
    expect(policy.version).toBe(1);
    expect(policy.enabled).toBe(true);
    expect(policy.autonomy).toBe("alert");
    expect(policy.trigger).toBe("periodic");
    expect(policy.intervalEvents).toBe(5);
    expect(policy.model).toBe("claude-sonnet-4-6");
    expect(policy.systemPrompt).toContain("## Role");
  });

  it("applies defaults for missing optional fields", () => {
    const minimal = `---
name: minimal
---

Body text.
`;
    const policy = parsePolicy(minimal);
    expect(policy.name).toBe("minimal");
    expect(policy.version).toBe(1);
    expect(policy.enabled).toBe(false);
    expect(policy.autonomy).toBe("alert");
    expect(policy.trigger).toBe("periodic");
    expect(policy.intervalEvents).toBe(10);
    expect(policy.model).toBe("claude-sonnet-4-6");
    expect(policy.systemPrompt).toBe("Body text.");
  });

  it("throws on missing name field", () => {
    const noName = `---
version: 1
---

Body.
`;
    expect(() => parsePolicy(noName)).toThrow("missing required field: name");
  });

  it("throws on missing frontmatter", () => {
    expect(() => parsePolicy("just a body")).toThrow(
      "missing YAML frontmatter",
    );
  });

  it("throws on invalid YAML", () => {
    const bad = `---
: invalid: yaml: [
---

Body.
`;
    expect(() => parsePolicy(bad)).toThrow();
  });

  it("extracts body correctly", () => {
    const policy = parsePolicy(VALID_POLICY);
    expect(policy.systemPrompt).toBe("## Role\nYou are the Reviewer observer.");
  });

  it("handles version field present", () => {
    const withVersion = `---
name: test
version: 3
---

Body.
`;
    const policy = parsePolicy(withVersion);
    expect(policy.version).toBe(3);
  });

  it("defaults invalid autonomy to alert", () => {
    const policy = parsePolicy(`---
name: test
autonomy: invalid
---

Body.
`);
    expect(policy.autonomy).toBe("alert");
  });

  it("defaults invalid trigger to periodic", () => {
    const policy = parsePolicy(`---
name: test
trigger: bogus
---

Body.
`);
    expect(policy.trigger).toBe("periodic");
  });
});

describe("loadPolicy", () => {
  it("loads a policy from disk", () => {
    const dir = makeTempDir();
    const agentsDir = join(dir, ".telesis", "agents");
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(join(agentsDir, "reviewer.md"), VALID_POLICY);

    const policy = loadPolicy(agentsDir, "reviewer");
    expect(policy.name).toBe("reviewer");
    expect(policy.enabled).toBe(true);
  });
});

describe("loadAllPolicies", () => {
  it("loads all .md files from agents directory", () => {
    const dir = makeTempDir();
    const agentsDir = join(dir, ".telesis", "agents");
    mkdirSync(agentsDir, { recursive: true });

    writeFileSync(
      join(agentsDir, "architect.md"),
      `---\nname: architect\nenabled: true\n---\n\nArch body.`,
    );
    writeFileSync(
      join(agentsDir, "reviewer.md"),
      `---\nname: reviewer\nenabled: true\n---\n\nReview body.`,
    );

    const policies = loadAllPolicies(dir);
    expect(policies).toHaveLength(2);
    expect(policies[0]!.name).toBe("architect");
    expect(policies[1]!.name).toBe("reviewer");
  });

  it("returns empty array if directory does not exist", () => {
    const dir = makeTempDir();
    const policies = loadAllPolicies(dir);
    expect(policies).toEqual([]);
  });

  it("skips non-.md files", () => {
    const dir = makeTempDir();
    const agentsDir = join(dir, ".telesis", "agents");
    mkdirSync(agentsDir, { recursive: true });

    writeFileSync(
      join(agentsDir, "reviewer.md"),
      `---\nname: reviewer\n---\n\nBody.`,
    );
    writeFileSync(join(agentsDir, "notes.txt"), "not a policy");

    const policies = loadAllPolicies(dir);
    expect(policies).toHaveLength(1);
  });
});
