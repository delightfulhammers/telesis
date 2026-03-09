import {
  mkdirSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { save, exists } from "../config/config.js";
import type { Config } from "../config/config.js";
import { generate } from "../context/context.js";
import { renderTemplate } from "../templates/index.js";
import type { TemplateName } from "../templates/index.js";

interface DocFile {
  readonly template: TemplateName;
  readonly dest: string;
}

const DOC_FILES: readonly DocFile[] = [
  { template: "vision.md.tmpl", dest: "docs/VISION.md" },
  { template: "prd.md.tmpl", dest: "docs/PRD.md" },
  { template: "architecture.md.tmpl", dest: "docs/ARCHITECTURE.md" },
  { template: "milestones.md.tmpl", dest: "docs/MILESTONES.md" },
];

const README_STUBS: Record<string, string> = {
  "docs/adr/README.md":
    "# Architectural Decision Records (ADRs)\n\nThis directory contains ADR files created by `telesis adr new <slug>`.\n\nEach ADR captures a significant architectural decision with its context, rationale, and consequences.\n",
  "docs/tdd/README.md":
    "# Technical Design Documents (TDDs)\n\nThis directory contains TDD files created by `telesis tdd new <slug>`.\n\nEach TDD details the design of a specific component or subsystem.\n",
};

let atomicCounter = 0;

const validateInput = (cfg: Config): void => {
  if (!cfg.project.name) {
    throw new Error("project name is required");
  }

  const fields: readonly { name: string; value: string }[] = [
    { name: "name", value: cfg.project.name },
    { name: "owner", value: cfg.project.owner },
    { name: "language", value: cfg.project.language },
    { name: "status", value: cfg.project.status },
    { name: "repo", value: cfg.project.repo },
  ];

  for (const { name, value } of fields) {
    if (/[\x00\n\r]/.test(value)) {
      throw new Error(
        `project ${name} contains invalid characters (newlines or null bytes)`,
      );
    }
    if (value.includes("{{")) {
      throw new Error(
        `project ${name} contains invalid character sequence '{{' `,
      );
    }
  }
};

const applyDefaults = (cfg: Config): Config => ({
  project: {
    ...cfg.project,
    status: cfg.project.status || "active",
  },
});

const createDirectories = (rootDir: string): void => {
  const dirs = [
    join(rootDir, "docs", "adr"),
    join(rootDir, "docs", "tdd"),
    join(rootDir, "docs", "context"),
  ];
  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true, mode: 0o755 });
  }
};

const writeFileAtomic = (dest: string, content: string): void => {
  const dir = dirname(dest);
  mkdirSync(dir, { recursive: true, mode: 0o755 });

  const tmpPath = join(
    dir,
    `.scaffold-${process.pid}-${++atomicCounter}`,
  );

  try {
    writeFileSync(tmpPath, content, { mode: 0o666 });
    renameSync(tmpPath, dest);
  } catch (err) {
    try {
      unlinkSync(tmpPath);
    } catch {
      // cleanup best-effort
    }
    throw err;
  }
};

const renderDocStubs = (rootDir: string, cfg: Config): void => {
  const data = {
    ProjectName: cfg.project.name,
    ProjectOwner: cfg.project.owner,
  };

  for (const df of DOC_FILES) {
    const content = renderTemplate(df.template, data);
    const dest = join(rootDir, df.dest);
    writeFileAtomic(dest, content);
  }
};

const writeREADMEStubs = (rootDir: string): void => {
  for (const [relPath, content] of Object.entries(README_STUBS)) {
    const dest = join(rootDir, relPath);
    writeFileAtomic(dest, content);
  }
};

const generateCLAUDEMD = (rootDir: string): void => {
  const output = generate(rootDir);
  const dest = join(rootDir, "CLAUDE.md");
  writeFileAtomic(dest, output);
};

export const scaffold = (rootDir: string, cfg: Config): void => {
  validateInput(cfg);

  if (exists(rootDir)) {
    throw new Error(
      "project already initialized (run `telesis context` to regenerate CLAUDE.md)",
    );
  }

  const local = applyDefaults(cfg);

  createDirectories(rootDir);
  renderDocStubs(rootDir, local);
  writeREADMEStubs(rootDir);

  // Config must be saved before CLAUDE.md generation
  save(rootDir, local);
  generateCLAUDEMD(rootDir);
};
