import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RootResolver } from "../root-resolver.js";
import { load } from "../../config/config.js";
import { dump } from "js-yaml";

interface DocResource {
  readonly uri: string;
  readonly name: string;
  readonly description: string;
  readonly relativePath: string;
  readonly mimeType: string;
}

const DOC_RESOURCES: readonly DocResource[] = [
  {
    uri: "telesis://docs/VISION.md",
    name: "Project Vision",
    description: "Foundational vision and design principles for the project",
    relativePath: "docs/VISION.md",
    mimeType: "text/markdown",
  },
  {
    uri: "telesis://docs/PRD.md",
    name: "Product Requirements",
    description: "Requirements, user journeys, and feature specifications",
    relativePath: "docs/PRD.md",
    mimeType: "text/markdown",
  },
  {
    uri: "telesis://docs/ARCHITECTURE.md",
    name: "Architecture",
    description: "System design, repo structure, and component documentation",
    relativePath: "docs/ARCHITECTURE.md",
    mimeType: "text/markdown",
  },
  {
    uri: "telesis://docs/MILESTONES.md",
    name: "Milestones",
    description: "Milestone plan with status and acceptance criteria",
    relativePath: "docs/MILESTONES.md",
    mimeType: "text/markdown",
  },
  {
    uri: "telesis://CLAUDE.md",
    name: "CLAUDE.md Context",
    description: "Generated context file for Claude Code sessions",
    relativePath: "CLAUDE.md",
    mimeType: "text/markdown",
  },
];

const readFileSafe = (path: string): string => {
  try {
    return readFileSync(path, "utf-8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(`File not found: ${path}`);
    }
    throw err;
  }
};

export const registerDocResources = (
  server: McpServer,
  resolveRoot: RootResolver,
): void => {
  // Register static doc resources
  for (const doc of DOC_RESOURCES) {
    server.resource(
      doc.uri,
      doc.uri,
      {
        description: doc.description,
        mimeType: doc.mimeType,
      },
      async (uri) => {
        const rootDir = resolveRoot();
        const content = readFileSafe(join(rootDir, doc.relativePath));
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: doc.mimeType,
              text: content,
            },
          ],
        };
      },
    );
  }

  // Register config as YAML
  server.resource(
    "telesis://config",
    "telesis://config",
    {
      description: "Parsed project configuration (.telesis/config.yml) as YAML",
      mimeType: "text/yaml",
    },
    async (uri) => {
      const rootDir = resolveRoot();
      const config = load(rootDir);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/yaml",
            text: dump(config),
          },
        ],
      };
    },
  );
};
