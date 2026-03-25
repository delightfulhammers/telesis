import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../../test-utils.js";
import { scanSkills, type SkillDescriptor } from "./guidance.js";

const makeTempDir = useTempDir("guidance-resource-test");

const writeSkill = (
  rootDir: string,
  name: string,
  description: string,
  body: string,
): void => {
  const skillDir = join(rootDir, ".claude", "skills", name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: "${description}"\n---\n\n${body}\n`,
  );
};

describe("scanSkills", () => {
  it("returns descriptors for all skills in .claude/skills/", () => {
    const dir = makeTempDir();
    writeSkill(
      dir,
      "telesis-pipeline",
      "Pipeline guidance",
      "# Pipeline\nFollow the lifecycle.",
    );
    writeSkill(
      dir,
      "telesis-review",
      "Review guidance",
      "# Review\nRun review before push.",
    );

    const skills = scanSkills(dir);

    expect(skills).toHaveLength(2);
    const names = skills.map((s) => s.name);
    expect(names).toContain("telesis-pipeline");
    expect(names).toContain("telesis-review");
  });

  it("extracts description from frontmatter", () => {
    const dir = makeTempDir();
    writeSkill(
      dir,
      "telesis-pipeline",
      "Use when working in a Telesis project",
      "# Pipeline",
    );

    const skills = scanSkills(dir);

    expect(skills[0].description).toBe("Use when working in a Telesis project");
  });

  it("extracts body content (after frontmatter)", () => {
    const dir = makeTempDir();
    writeSkill(
      dir,
      "telesis-pipeline",
      "desc",
      "# Pipeline\n\nFollow the lifecycle.",
    );

    const skills = scanSkills(dir);

    expect(skills[0].body).toContain("# Pipeline");
    expect(skills[0].body).toContain("Follow the lifecycle.");
  });

  it("produces correct URI for each skill", () => {
    const dir = makeTempDir();
    writeSkill(dir, "telesis-review", "desc", "# Review");

    const skills = scanSkills(dir);

    expect(skills[0].uri).toBe("telesis://guidance/telesis-review");
  });

  it("returns empty array when .claude/skills/ does not exist", () => {
    const dir = makeTempDir();
    const skills = scanSkills(dir);
    expect(skills).toEqual([]);
  });

  it("skips directories without SKILL.md", () => {
    const dir = makeTempDir();
    const skillDir = join(dir, ".claude", "skills", "empty-skill");
    mkdirSync(skillDir, { recursive: true });
    // No SKILL.md

    const skills = scanSkills(dir);
    expect(skills).toEqual([]);
  });

  it("uses skill name as fallback description when frontmatter missing", () => {
    const dir = makeTempDir();
    const skillDir = join(dir, ".claude", "skills", "no-frontmatter");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      "# Just content\nNo frontmatter here.\n",
    );

    const skills = scanSkills(dir);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("no-frontmatter");
    expect(skills[0].description).toBe("no-frontmatter");
    expect(skills[0].body).toContain("# Just content");
  });
});
