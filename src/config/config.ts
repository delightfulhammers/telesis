import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  renameSync,
  unlinkSync,
  openSync,
  closeSync,
  constants,
} from "node:fs";
import { join } from "node:path";
import * as yaml from "js-yaml";

const TELESIS_DIR = ".telesis";
const CONFIG_FILE = "config.yml";

let configCounter = 0;

export interface Project {
  readonly name: string;
  readonly owner: string;
  readonly language: string;
  readonly status: string;
  readonly repo: string;
}

export interface PersonaConfig {
  readonly slug: string;
  readonly model?: string;
}

export interface ReviewConfig {
  readonly model?: string;
  readonly personas?: readonly PersonaConfig[];
}

export interface Config {
  readonly project: Project;
  readonly review?: ReviewConfig;
}

const configPath = (rootDir: string): string =>
  join(rootDir, TELESIS_DIR, CONFIG_FILE);

const validate = (cfg: Config): void => {
  if (!cfg.project?.name) {
    throw new Error("config missing required field: project.name");
  }
};

const parsePersonaConfig = (raw: unknown): PersonaConfig | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.slug !== "string" || r.slug.length === 0) return null;
  return {
    slug: r.slug,
    model: typeof r.model === "string" ? r.model : undefined,
  };
};

const parseReviewConfig = (raw: unknown): ReviewConfig | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;

  const model = typeof r.model === "string" ? r.model : undefined;

  let personas: PersonaConfig[] | undefined;
  if (Array.isArray(r.personas)) {
    const parsed = r.personas
      .map(parsePersonaConfig)
      .filter((p): p is PersonaConfig => p !== null);
    if (parsed.length > 0) personas = parsed;
  }

  if (!model && !personas) return undefined;

  return { model, personas };
};

export const load = (rootDir: string): Config => {
  const path = configPath(rootDir);
  let data: string;
  try {
    data = readFileSync(path, "utf-8");
  } catch {
    throw new Error("could not read config (run `telesis init` first)");
  }

  const raw = yaml.load(data, { schema: yaml.JSON_SCHEMA }) as
    | Record<string, unknown>
    | undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("config must be a YAML mapping, not a scalar or list");
  }

  const project = raw.project;
  if (!project || typeof project !== "object") {
    throw new Error("config missing required field: project.name");
  }

  const p = project as Record<string, unknown>;
  const str = (key: string): string => {
    const val = p[key];
    if (val === undefined || val === null) return "";
    if (typeof val !== "string") {
      throw new Error(`config field project.${key} must be a string`);
    }
    return val;
  };

  const cfg: Config = {
    project: {
      name: str("name"),
      owner: str("owner"),
      language: str("language"),
      status: str("status"),
      repo: str("repo"),
    },
    review: parseReviewConfig(raw.review),
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
  const tmpPath = join(dir, `.config-${process.pid}-${++configCounter}.yml`);

  const fd = openSync(
    tmpPath,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    0o644,
  );

  try {
    writeFileSync(fd, content);
  } catch (err) {
    try {
      closeSync(fd);
    } catch {
      /* best-effort */
    }
    try {
      unlinkSync(tmpPath);
    } catch {
      /* best-effort */
    }
    throw err;
  }

  closeSync(fd);

  try {
    renameSync(tmpPath, dest);
  } catch (err) {
    try {
      unlinkSync(tmpPath);
    } catch {
      /* cleanup best-effort */
    }
    throw err;
  }
};

export const exists = (rootDir: string): boolean => {
  return existsSync(configPath(rootDir));
};
