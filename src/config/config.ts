import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import * as yaml from "js-yaml";

const TELESIS_DIR = ".telesis";
const CONFIG_FILE = "config.yml";

export interface Project {
  readonly name: string;
  readonly owner: string;
  readonly language: string;
  readonly status: string;
  readonly repo: string;
}

export interface Config {
  readonly project: Project;
}

const configPath = (rootDir: string): string =>
  join(rootDir, TELESIS_DIR, CONFIG_FILE);

const validate = (cfg: Config): void => {
  if (!cfg.project?.name) {
    throw new Error("config missing required field: project.name");
  }
};

export const load = (rootDir: string): Config => {
  const path = configPath(rootDir);
  let data: string;
  try {
    data = readFileSync(path, "utf-8");
  } catch {
    throw new Error(
      "could not read config (run `telesis init` first)",
    );
  }

  const raw = yaml.load(data, { schema: yaml.JSON_SCHEMA }) as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object") {
    throw new Error("config missing required field: project.name");
  }

  const project = (raw.project ?? {}) as Record<string, string>;
  const cfg: Config = {
    project: {
      name: project.name ?? "",
      owner: project.owner ?? "",
      language: project.language ?? "",
      status: project.status ?? "",
      repo: project.repo ?? "",
    },
  };

  validate(cfg);
  return cfg;
};

export const save = (rootDir: string, cfg: Config): void => {
  const dir = join(rootDir, TELESIS_DIR);
  mkdirSync(dir, { recursive: true, mode: 0o700 });

  const content =
    "# Telesis project configuration\n" + yaml.dump({ project: cfg.project });

  // Atomic write: temp file + rename
  const dest = configPath(rootDir);
  const tmpPath = join(dir, `.config-${process.pid}-${Date.now()}.yml`);

  try {
    writeFileSync(tmpPath, content, { mode: 0o644 });
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

export const exists = (rootDir: string): boolean => {
  return existsSync(configPath(rootDir));
};
