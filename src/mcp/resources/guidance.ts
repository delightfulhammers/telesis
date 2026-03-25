import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RootResolver } from "../root-resolver.js";

/** A parsed skill descriptor for MCP resource registration */
export interface SkillDescriptor {
  readonly name: string;
  readonly uri: string;
  readonly description: string;
  readonly body: string;
}

/** Parse YAML frontmatter from a skill markdown file */
const parseFrontmatter = (
  content: string,
): { description?: string; body: string } => {
  if (!content.startsWith("---")) {
    return { body: content.trim() };
  }

  // Search for closing --- at line boundary to avoid matching mid-content
  const endIdx = content.indexOf("\n---", 3);
  if (endIdx === -1) {
    return { body: content.trim() };
  }

  const frontmatter = content.slice(3, endIdx);
  const body = content.slice(endIdx + 4).trim(); // +4 for \n---

  // Simple YAML extraction — just need description field
  const descMatch = frontmatter.match(
    /description:\s*"([^"]*)"|\bdescription:\s*'([^']*)'|\bdescription:\s+(.+)/,
  );
  const description =
    descMatch?.[1] ?? descMatch?.[2] ?? descMatch?.[3]?.trim();

  return { description, body };
};

/** Scan .claude/skills/ directory and return skill descriptors */
export const scanSkills = (rootDir: string): readonly SkillDescriptor[] => {
  const skillsDir = join(rootDir, ".claude", "skills");

  if (!existsSync(skillsDir)) return [];

  let entries: string[];
  try {
    entries = readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }

  const descriptors: SkillDescriptor[] = [];

  for (const entry of entries) {
    const skillFile = join(skillsDir, entry, "SKILL.md");
    if (!existsSync(skillFile)) continue;

    try {
      const content = readFileSync(skillFile, "utf-8");
      const { description, body } = parseFrontmatter(content);

      descriptors.push({
        name: entry,
        uri: `telesis://guidance/${entry}`,
        description: description || entry,
        body,
      });
    } catch {
      // Skip unreadable skill files
    }
  }

  return descriptors;
};

/**
 * Register guidance resources from .claude/skills/ as MCP resources.
 * Resources are registered at server startup. New skills added after startup
 * require an MCP server restart to become available as resources.
 */
export const registerGuidanceResources = (
  server: McpServer,
  resolveRoot: RootResolver,
): void => {
  // Scan at registration time to discover available skills.
  // Gracefully handle missing project root (e.g., in tests).
  let skills: readonly SkillDescriptor[];
  try {
    const rootDir = resolveRoot();
    skills = scanSkills(rootDir);
  } catch {
    skills = [];
  }

  for (const skill of skills) {
    server.resource(
      skill.uri,
      skill.uri,
      {
        description: skill.description,
        mimeType: "text/markdown",
      },
      async () => {
        // Re-read at request time to serve current content
        const currentRoot = resolveRoot();
        const currentSkills = scanSkills(currentRoot);
        const current = currentSkills.find((s) => s.name === skill.name);
        const content = current?.body ?? skill.body;

        return {
          contents: [
            {
              uri: skill.uri,
              mimeType: "text/markdown",
              text: content,
            },
          ],
        };
      },
    );
  }
};
