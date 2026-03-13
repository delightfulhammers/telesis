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
import type { ValidationConfig } from "../validation/types.js";

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
  readonly judgeModel?: string;
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
  const judgeModel =
    typeof r.judgeModel === "string" ? r.judgeModel : undefined;

  let personas: PersonaConfig[] | undefined;
  if (Array.isArray(r.personas)) {
    const parsed = r.personas
      .map(parsePersonaConfig)
      .filter((p): p is PersonaConfig => p !== null);
    if (parsed.length > 0) personas = parsed;
  }

  if (!model && !judgeModel && !personas) return undefined;

  return { model, judgeModel, personas };
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

export interface DispatchConfig {
  readonly defaultAgent?: string;
  readonly maxConcurrent?: number;
  readonly acpxPath?: string;
}

/** Parse dispatch config from .telesis/config.yml, returning defaults if absent */
export const parseDispatchConfig = (rootDir: string): DispatchConfig => {
  const path = configPath(rootDir);
  let data: string;
  try {
    data = readFileSync(path, "utf-8");
  } catch {
    return {};
  }

  const raw = yaml.load(data, { schema: yaml.JSON_SCHEMA }) as
    | Record<string, unknown>
    | undefined;
  if (!raw || typeof raw !== "object" || !raw.dispatch) return {};

  const dispatch = raw.dispatch;
  if (typeof dispatch !== "object" || dispatch === null) return {};

  const d = dispatch as Record<string, unknown>;
  const result: {
    defaultAgent?: string;
    maxConcurrent?: number;
    acpxPath?: string;
  } = {};

  if (typeof d.defaultAgent === "string" && d.defaultAgent.length > 0) {
    result.defaultAgent = d.defaultAgent;
  }
  if (typeof d.maxConcurrent === "number" && d.maxConcurrent > 0) {
    result.maxConcurrent = d.maxConcurrent;
  }
  if (typeof d.acpxPath === "string" && d.acpxPath.length > 0) {
    result.acpxPath = d.acpxPath;
  }

  return result;
};

export interface OversightConfig {
  readonly enabled?: boolean;
  readonly defaultModel?: string;
}

/** Parse oversight config from .telesis/config.yml, returning defaults if absent */
export const parseOversightConfig = (rootDir: string): OversightConfig => {
  const path = configPath(rootDir);
  let data: string;
  try {
    data = readFileSync(path, "utf-8");
  } catch {
    return {};
  }

  const raw = yaml.load(data, { schema: yaml.JSON_SCHEMA }) as
    | Record<string, unknown>
    | undefined;
  if (!raw || typeof raw !== "object" || !raw.oversight) return {};

  const oversight = raw.oversight;
  if (typeof oversight !== "object" || oversight === null) return {};

  const o = oversight as Record<string, unknown>;
  const result: {
    enabled?: boolean;
    defaultModel?: string;
  } = {};

  if (typeof o.enabled === "boolean") {
    result.enabled = o.enabled;
  }
  if (typeof o.defaultModel === "string" && o.defaultModel.length > 0) {
    result.defaultModel = o.defaultModel;
  }

  return result;
};

export interface IntakeGitHubConfig {
  readonly labels?: readonly string[];
  readonly excludeLabels?: readonly string[];
  readonly assignee?: string;
  readonly state?: string;
}

export interface IntakeConfig {
  readonly github?: IntakeGitHubConfig;
}

/** Parse intake config from .telesis/config.yml, returning defaults if absent */
export const parseIntakeConfig = (rootDir: string): IntakeConfig => {
  const path = configPath(rootDir);
  let data: string;
  try {
    data = readFileSync(path, "utf-8");
  } catch {
    return {};
  }

  const raw = yaml.load(data, { schema: yaml.JSON_SCHEMA }) as
    | Record<string, unknown>
    | undefined;
  if (!raw || typeof raw !== "object" || !raw.intake) return {};

  const intake = raw.intake;
  if (typeof intake !== "object" || intake === null) return {};

  const i = intake as Record<string, unknown>;
  const result: { github?: IntakeGitHubConfig } = {};

  if (i.github && typeof i.github === "object" && !Array.isArray(i.github)) {
    const g = i.github as Record<string, unknown>;
    const ghConfig: {
      labels?: readonly string[];
      excludeLabels?: readonly string[];
      assignee?: string;
      state?: string;
    } = {};

    if (Array.isArray(g.labels)) {
      const labels = g.labels.filter(
        (v): v is string => typeof v === "string" && v.length > 0,
      );
      if (labels.length > 0) ghConfig.labels = labels;
    }

    if (Array.isArray(g.excludeLabels)) {
      const excludeLabels = g.excludeLabels.filter(
        (v): v is string => typeof v === "string" && v.length > 0,
      );
      if (excludeLabels.length > 0) ghConfig.excludeLabels = excludeLabels;
    }

    if (typeof g.assignee === "string" && g.assignee.length > 0) {
      ghConfig.assignee = g.assignee;
    }

    if (typeof g.state === "string" && g.state.length > 0) {
      ghConfig.state = g.state;
    }

    if (Object.keys(ghConfig).length > 0) {
      result.github = ghConfig;
    }
  }

  return result;
};

export interface DaemonConfig {
  readonly watch?: {
    readonly ignore?: readonly string[];
  };
  readonly heartbeatIntervalMs?: number;
}

/** Parse daemon config from .telesis/config.yml, returning defaults if absent */
export const parseDaemonConfig = (rootDir: string): DaemonConfig => {
  const path = configPath(rootDir);
  let data: string;
  try {
    data = readFileSync(path, "utf-8");
  } catch {
    return {};
  }

  const raw = yaml.load(data, { schema: yaml.JSON_SCHEMA }) as
    | Record<string, unknown>
    | undefined;
  if (!raw || typeof raw !== "object" || !raw.daemon) return {};

  const daemon = raw.daemon;
  if (typeof daemon !== "object" || daemon === null) return {};

  const d = daemon as Record<string, unknown>;
  const result: {
    watch?: { ignore?: readonly string[] };
    heartbeatIntervalMs?: number;
  } = {};

  if (typeof d.heartbeatIntervalMs === "number" && d.heartbeatIntervalMs > 0) {
    result.heartbeatIntervalMs = d.heartbeatIntervalMs;
  }

  if (d.watch && typeof d.watch === "object") {
    const w = d.watch as Record<string, unknown>;
    if (Array.isArray(w.ignore)) {
      const ignore = w.ignore.filter(
        (v): v is string => typeof v === "string" && v.length > 0,
      );
      if (ignore.length > 0) {
        result.watch = { ignore };
      }
    }
  }

  return result;
};

export type { ValidationConfig };

/** Parse validation config from .telesis/config.yml, returning defaults if absent */
export const parseValidationConfig = (rootDir: string): ValidationConfig => {
  const path = configPath(rootDir);
  let data: string;
  try {
    data = readFileSync(path, "utf-8");
  } catch {
    return {};
  }

  const raw = yaml.load(data, { schema: yaml.JSON_SCHEMA }) as
    | Record<string, unknown>
    | undefined;
  if (!raw || typeof raw !== "object" || !raw.validation) return {};

  const validation = raw.validation;
  if (typeof validation !== "object" || validation === null) return {};

  const v = validation as Record<string, unknown>;
  const result: {
    model?: string;
    maxRetries?: number;
    enableGates?: boolean;
  } = {};

  if (typeof v.model === "string" && v.model.length > 0) {
    result.model = v.model;
  }
  if (typeof v.maxRetries === "number" && v.maxRetries >= 0) {
    result.maxRetries = v.maxRetries;
  }
  if (typeof v.enableGates === "boolean") {
    result.enableGates = v.enableGates;
  }

  return result;
};

export interface PlannerConfig {
  readonly model?: string;
  readonly maxTasks?: number;
}

/** Parse planner config from .telesis/config.yml, returning defaults if absent */
export const parsePlannerConfig = (rootDir: string): PlannerConfig => {
  const path = configPath(rootDir);
  let data: string;
  try {
    data = readFileSync(path, "utf-8");
  } catch {
    return {};
  }

  const raw = yaml.load(data, { schema: yaml.JSON_SCHEMA }) as
    | Record<string, unknown>
    | undefined;
  if (!raw || typeof raw !== "object" || !raw.planner) return {};

  const planner = raw.planner;
  if (typeof planner !== "object" || planner === null) return {};

  const p = planner as Record<string, unknown>;
  const result: {
    model?: string;
    maxTasks?: number;
  } = {};

  if (typeof p.model === "string" && p.model.length > 0) {
    result.model = p.model;
  }
  if (typeof p.maxTasks === "number" && p.maxTasks > 0) {
    result.maxTasks = p.maxTasks;
  }

  return result;
};
