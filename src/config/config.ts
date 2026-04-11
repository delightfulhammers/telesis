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
type RawConfig = Record<string, unknown>;

let configCounter = 0;

export interface Project {
  readonly name: string;
  readonly owner: string;
  readonly language: string;
  readonly languages: readonly string[];
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
  readonly context?: ContextConfig;
}

const configPath = (rootDir: string): string =>
  join(rootDir, TELESIS_DIR, CONFIG_FILE);

export const loadRawConfig = (
  rootDir: string = process.cwd(),
): RawConfig | null => {
  const path = configPath(rootDir);
  let data: string;
  try {
    data = readFileSync(path, "utf-8");
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      err.code === "ENOENT"
    ) {
      return null;
    }
    throw err;
  }

  const raw = yaml.load(data, { schema: yaml.JSON_SCHEMA });
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  return raw as RawConfig;
};

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

  const languages: readonly string[] = (() => {
    const rawLangs = p.languages;
    if (Array.isArray(rawLangs)) {
      return rawLangs.filter(
        (l): l is string => typeof l === "string" && l.length > 0,
      );
    }
    return [];
  })();
  const language = languages[0] ?? "";

  const cfg: Config = {
    project: {
      name: str("name"),
      owner: str("owner"),
      language,
      languages,
      status: str("status"),
      repo: str("repo"),
    },
    review: parseReviewConfig(raw.review),
    context: parseContextConfig(raw as RawConfig),
  };

  validate(cfg);
  return cfg;
};

export const save = (rootDir: string, cfg: Config): void => {
  const dir = join(rootDir, TELESIS_DIR);
  mkdirSync(dir, { recursive: true, mode: 0o700 });

  // Write `languages` array instead of singular `language`
  const { language: _lang, ...projectRest } = cfg.project;
  const content =
    "# Telesis project configuration\n" + yaml.dump({ project: projectRest });

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
export const parseDispatchConfig = (raw: RawConfig | null): DispatchConfig => {
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
export const parseOversightConfig = (
  raw: RawConfig | null,
): OversightConfig => {
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

export interface GitHubConfig {
  readonly apiUrl?: string;
}

/** Parse github config from .telesis/config.yml, returning defaults if absent */
export const parseGitHubConfig = (raw: RawConfig | null): GitHubConfig => {
  if (!raw || typeof raw !== "object" || !raw.github) return {};

  const github = raw.github;
  if (typeof github !== "object" || github === null) return {};

  const g = github as Record<string, unknown>;
  const result: { apiUrl?: string } = {};

  if (typeof g.apiUrl === "string" && g.apiUrl.length > 0) {
    result.apiUrl = g.apiUrl;
  }

  return result;
};

/** Resolve the GitHub API base URL from environment and config.
 *  Precedence: GITHUB_API_URL env > github.apiUrl config > default.
 *  Non-HTTPS values are ignored with a warning to prevent credential leaks. */
export const resolveGitHubApiBase = (raw: RawConfig | null): string => {
  const env = process.env.GITHUB_API_URL;
  if (env) {
    const cleaned = env.replace(/\/+$/, "");
    if (!cleaned.startsWith("https://")) {
      process.stderr.write(
        `[telesis] Warning: GITHUB_API_URL must use HTTPS, ignoring: ${cleaned}\n`,
      );
    } else {
      return cleaned;
    }
  }

  const config = parseGitHubConfig(raw);
  if (config.apiUrl) {
    const cleaned = config.apiUrl.replace(/\/+$/, "");
    if (!cleaned.startsWith("https://")) {
      process.stderr.write(
        `[telesis] Warning: github.apiUrl must use HTTPS, ignoring: ${cleaned}\n`,
      );
    } else {
      return cleaned;
    }
  }

  return "https://api.github.com";
};

export interface IntakeGitHubConfig {
  readonly labels?: readonly string[];
  readonly excludeLabels?: readonly string[];
  readonly assignee?: string;
  readonly state?: string;
}

export interface IntakeJiraConfig {
  readonly baseUrl: string;
  readonly project?: string;
  readonly jql?: string;
  readonly labels?: readonly string[];
  readonly assignee?: string;
  readonly status?: readonly string[];
  readonly issueTypes?: readonly string[];
}

export interface IntakeConfig {
  readonly github?: IntakeGitHubConfig;
  readonly jira?: IntakeJiraConfig;
}

const parseStringArray = (raw: unknown): readonly string[] | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const filtered = raw.filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  return filtered.length > 0 ? filtered : undefined;
};

/** Parse intake config from .telesis/config.yml, returning defaults if absent */
export const parseIntakeConfig = (raw: RawConfig | null): IntakeConfig => {
  if (!raw || typeof raw !== "object" || !raw.intake) return {};

  const intake = raw.intake;
  if (typeof intake !== "object" || intake === null) return {};

  const i = intake as Record<string, unknown>;
  const result: { github?: IntakeGitHubConfig; jira?: IntakeJiraConfig } = {};

  if (i.github && typeof i.github === "object" && !Array.isArray(i.github)) {
    const g = i.github as Record<string, unknown>;
    const ghConfig: {
      labels?: readonly string[];
      excludeLabels?: readonly string[];
      assignee?: string;
      state?: string;
    } = {};

    const labels = parseStringArray(g.labels);
    if (labels) ghConfig.labels = labels;

    const excludeLabels = parseStringArray(g.excludeLabels);
    if (excludeLabels) ghConfig.excludeLabels = excludeLabels;

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

  if (i.jira && typeof i.jira === "object" && !Array.isArray(i.jira)) {
    const j = i.jira as Record<string, unknown>;

    if (typeof j.baseUrl === "string" && j.baseUrl.length > 0) {
      const jiraConfig: {
        baseUrl: string;
        project?: string;
        jql?: string;
        labels?: readonly string[];
        assignee?: string;
        status?: readonly string[];
        issueTypes?: readonly string[];
      } = { baseUrl: j.baseUrl };

      if (typeof j.project === "string" && j.project.length > 0) {
        jiraConfig.project = j.project;
      }
      if (typeof j.jql === "string" && j.jql.length > 0) {
        jiraConfig.jql = j.jql;
      }
      if (typeof j.assignee === "string" && j.assignee.length > 0) {
        jiraConfig.assignee = j.assignee;
      }

      const labels = parseStringArray(j.labels);
      if (labels) jiraConfig.labels = labels;

      const status = parseStringArray(j.status);
      if (status) jiraConfig.status = status;

      const issueTypes = parseStringArray(j.issueTypes);
      if (issueTypes) jiraConfig.issueTypes = issueTypes;

      result.jira = jiraConfig;
    }
  }

  return result;
};

/** What the daemon does when a dispatched agent session ends */
export type RestartPolicy = "auto-restart" | "notify-only" | "manual";

/** Session lifecycle configuration for the daemon */
export interface SessionLifecycleConfig {
  /** What to do when a dispatched session ends. Default: "notify-only" */
  readonly restartPolicy?: RestartPolicy;
  /** Minimum seconds between auto-restarts. Default: 30 */
  readonly cooldownSeconds?: number;
  /** Max auto-restarts per milestone before circuit-breaking. Default: 10 */
  readonly maxRestartsPerMilestone?: number;
}

export interface DaemonConfig {
  readonly watch?: {
    readonly ignore?: readonly string[];
  };
  readonly heartbeatIntervalMs?: number;
  readonly sessionLifecycle?: SessionLifecycleConfig;
}

/** Parse daemon config from .telesis/config.yml, returning defaults if absent */
export const parseDaemonConfig = (raw: RawConfig | null): DaemonConfig => {
  if (!raw || typeof raw !== "object" || !raw.daemon) return {};

  const daemon = raw.daemon;
  if (typeof daemon !== "object" || daemon === null) return {};

  const d = daemon as Record<string, unknown>;
  const result: {
    watch?: { ignore?: readonly string[] };
    heartbeatIntervalMs?: number;
    sessionLifecycle?: SessionLifecycleConfig;
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

  const validPolicies = new Set(["auto-restart", "notify-only", "manual"]);
  if (d.sessionLifecycle && typeof d.sessionLifecycle === "object") {
    const sl = d.sessionLifecycle as Record<string, unknown>;
    const lifecycle: {
      restartPolicy?: RestartPolicy;
      cooldownSeconds?: number;
      maxRestartsPerMilestone?: number;
    } = {};

    if (
      typeof sl.restartPolicy === "string" &&
      validPolicies.has(sl.restartPolicy)
    ) {
      lifecycle.restartPolicy = sl.restartPolicy as RestartPolicy;
    }
    if (typeof sl.cooldownSeconds === "number" && sl.cooldownSeconds >= 0) {
      lifecycle.cooldownSeconds = sl.cooldownSeconds;
    }
    if (
      typeof sl.maxRestartsPerMilestone === "number" &&
      sl.maxRestartsPerMilestone >= 0
    ) {
      lifecycle.maxRestartsPerMilestone = sl.maxRestartsPerMilestone;
    }

    if (Object.keys(lifecycle).length > 0) {
      result.sessionLifecycle = lifecycle;
    }
  }

  return result;
};

export type { ValidationConfig };

/** Parse validation config from .telesis/config.yml, returning defaults if absent */
export const parseValidationConfig = (
  raw: RawConfig | null,
): ValidationConfig => {
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
export const parsePlannerConfig = (raw: RawConfig | null): PlannerConfig => {
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

export interface GitConfig {
  readonly branchPrefix?: string;
  readonly commitToMain?: boolean;
  readonly pushAfterCommit?: boolean;
  readonly createPR?: boolean;
  readonly llmCommitMessages?: boolean;
  readonly llmPRBody?: boolean;
}

/** Parse git config from .telesis/config.yml, returning defaults if absent */
export const parseGitConfig = (raw: RawConfig | null): GitConfig => {
  if (!raw || typeof raw !== "object" || !raw.git) return {};

  const git = raw.git;
  if (typeof git !== "object" || git === null) return {};

  const g = git as Record<string, unknown>;
  const result: {
    branchPrefix?: string;
    commitToMain?: boolean;
    pushAfterCommit?: boolean;
    createPR?: boolean;
    llmCommitMessages?: boolean;
    llmPRBody?: boolean;
  } = {};

  if (typeof g.branchPrefix === "string" && g.branchPrefix.length > 0) {
    result.branchPrefix = g.branchPrefix;
  }
  if (typeof g.commitToMain === "boolean") {
    result.commitToMain = g.commitToMain;
  }
  if (typeof g.pushAfterCommit === "boolean") {
    result.pushAfterCommit = g.pushAfterCommit;
  }
  if (typeof g.createPR === "boolean") {
    result.createPR = g.createPR;
  }
  if (typeof g.llmCommitMessages === "boolean") {
    result.llmCommitMessages = g.llmCommitMessages;
  }
  if (typeof g.llmPRBody === "boolean") {
    result.llmPRBody = g.llmPRBody;
  }

  return result;
};

export type DocLayerScope =
  | "all"
  | "adrs"
  | "tdds"
  | "context"
  | "vision"
  | "milestones";

const VALID_LAYER_SCOPES = new Set<string>([
  "all",
  "adrs",
  "tdds",
  "context",
  "vision",
  "milestones",
]);

export interface DocLayer {
  readonly path: string;
  readonly include: readonly DocLayerScope[];
}

export interface ContextConfig {
  readonly layers: readonly DocLayer[];
}

/** Parse context config from .telesis/config.yml, returning default single-layer if absent */
export const parseContextConfig = (raw: RawConfig | null): ContextConfig => {
  const defaultConfig: ContextConfig = {
    layers: [{ path: "docs", include: ["all"] }],
  };

  if (!raw || typeof raw !== "object" || !raw.context) return defaultConfig;

  const context = raw.context;
  if (typeof context !== "object" || context === null) return defaultConfig;

  const c = context as Record<string, unknown>;
  if (!Array.isArray(c.layers) || c.layers.length === 0) return defaultConfig;

  const layers = c.layers
    .map((item): DocLayer | null => {
      if (!item || typeof item !== "object") return null;
      const l = item as Record<string, unknown>;
      if (typeof l.path !== "string" || l.path.length === 0) return null;
      // Reject absolute paths and excessive traversal to prevent scanning
      // arbitrary filesystem locations. Allow up to 3 levels of ..
      // (sufficient for monorepo sub-projects reaching repo root).
      if (l.path.startsWith("/")) return null;
      const segments = l.path.split(/[/\\]/);
      const upCount = segments.filter((s: string) => s === "..").length;
      if (upCount > 3) return null;

      let include: DocLayerScope[];
      if (Array.isArray(l.include)) {
        include = l.include.filter(
          (v): v is DocLayerScope =>
            typeof v === "string" && VALID_LAYER_SCOPES.has(v),
        );
      } else {
        include = ["all"];
      }
      if (include.length === 0) include = ["all"];

      return { path: l.path, include };
    })
    .filter((l): l is DocLayer => l !== null);

  if (layers.length === 0) return defaultConfig;

  return { layers };
};

export interface DriftContainmentRule {
  readonly import: string;
  readonly allowedIn: readonly string[];
  readonly description?: string;
  readonly severity?: "error" | "warning";
  readonly excludeTests?: boolean;
}

export interface DriftConfig {
  readonly containment?: readonly DriftContainmentRule[];
  readonly expectedDirectories?: readonly string[];
}

/** Parse drift config from .telesis/config.yml, returning defaults if absent */
export const parseDriftConfig = (raw: RawConfig | null): DriftConfig => {
  if (!raw || typeof raw !== "object" || !raw.drift) return {};

  const drift = raw.drift;
  if (typeof drift !== "object" || drift === null) return {};

  const d = drift as Record<string, unknown>;
  const result: {
    containment?: DriftContainmentRule[];
    expectedDirectories?: readonly string[];
  } = {};

  if (Array.isArray(d.containment)) {
    const rules = d.containment
      .map((item): DriftContainmentRule | null => {
        if (!item || typeof item !== "object") return null;
        const r = item as Record<string, unknown>;
        if (typeof r.import !== "string" || r.import.length === 0) return null;
        if (!Array.isArray(r.allowedIn) || r.allowedIn.length === 0) {
          if (typeof r.import === "string") {
            process.stderr.write(
              `[telesis] drift.containment rule skipped: missing "allowedIn" for import "${r.import}"\n`,
            );
          }
          return null;
        }

        const allowedIn = r.allowedIn.filter(
          (v): v is string => typeof v === "string" && v.length > 0,
        );
        if (allowedIn.length === 0) return null;

        const rule: {
          import: string;
          allowedIn: readonly string[];
          description?: string;
          severity?: "error" | "warning";
          excludeTests?: boolean;
        } = { import: r.import, allowedIn };

        if (typeof r.description === "string" && r.description.length > 0) {
          rule.description = r.description;
        }
        if (r.severity === "error" || r.severity === "warning") {
          rule.severity = r.severity;
        }
        if (typeof r.excludeTests === "boolean") {
          rule.excludeTests = r.excludeTests;
        }

        return rule;
      })
      .filter((r): r is DriftContainmentRule => r !== null);

    if (rules.length > 0) result.containment = rules;
  }

  if (Array.isArray(d.expectedDirectories)) {
    const dirs = d.expectedDirectories.filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    if (dirs.length > 0) result.expectedDirectories = dirs;
  }

  return result;
};

export type ReviewBlockThreshold = "critical" | "high" | "medium" | "low";

const validReviewBlockThresholds: readonly string[] = [
  "critical",
  "high",
  "medium",
  "low",
];

export interface QualityGatesConfig {
  readonly format?: string | null;
  readonly lint?: string | null;
  readonly test?: string | null;
  readonly build?: string | null;
  readonly drift?: boolean;
}

export interface PipelineConfig {
  readonly autoApprove?: boolean;
  readonly closeIssue?: boolean;
  readonly reviewBeforePush?: boolean;
  readonly reviewBlockThreshold?: ReviewBlockThreshold;
  readonly reviewModel?: string;
  readonly qualityGates?: QualityGatesConfig;
}

/** Parse pipeline config from .telesis/config.yml, returning defaults if absent */
export const parsePipelineConfig = (raw: RawConfig | null): PipelineConfig => {
  const defaults = {
    reviewBeforePush: false as boolean,
    reviewBlockThreshold: "high" as ReviewBlockThreshold,
  };

  if (!raw || typeof raw !== "object" || !raw.pipeline) return defaults;

  const pipeline = raw.pipeline;
  if (typeof pipeline !== "object" || pipeline === null) return defaults;

  const p = pipeline as Record<string, unknown>;
  const result: {
    autoApprove?: boolean;
    closeIssue?: boolean;
    reviewBeforePush?: boolean;
    reviewBlockThreshold?: ReviewBlockThreshold;
    reviewModel?: string;
    qualityGates?: QualityGatesConfig;
  } = {};

  if (typeof p.autoApprove === "boolean") {
    result.autoApprove = p.autoApprove;
  }
  if (typeof p.closeIssue === "boolean") {
    result.closeIssue = p.closeIssue;
  }
  result.reviewBeforePush =
    typeof p.reviewBeforePush === "boolean" ? p.reviewBeforePush : false;
  if (p.reviewBlockThreshold !== undefined) {
    if (
      typeof p.reviewBlockThreshold !== "string" ||
      !validReviewBlockThresholds.includes(p.reviewBlockThreshold)
    ) {
      throw new TypeError(
        `Invalid reviewBlockThreshold: "${String(p.reviewBlockThreshold)}". Must be one of: ${validReviewBlockThresholds.join(", ")}`,
      );
    }
    result.reviewBlockThreshold =
      p.reviewBlockThreshold as ReviewBlockThreshold;
  } else {
    result.reviewBlockThreshold = "high";
  }
  if (typeof p.reviewModel === "string" && p.reviewModel.length > 0) {
    result.reviewModel = p.reviewModel;
  }

  if (
    p.qualityGates &&
    typeof p.qualityGates === "object" &&
    !Array.isArray(p.qualityGates)
  ) {
    const qg = p.qualityGates as Record<string, unknown>;
    const gates: {
      format?: string | null;
      lint?: string | null;
      test?: string | null;
      build?: string | null;
      drift?: boolean;
    } = {};

    const parseStringOrNull = (key: string): string | null | undefined => {
      const val = qg[key];
      if (val === null) return null;
      if (typeof val === "string") return val.length > 0 ? val : undefined;
      return undefined;
    };

    for (const key of ["format", "lint", "test", "build"] as const) {
      const val = parseStringOrNull(key);
      if (val !== undefined) {
        gates[key] = val;
      }
    }

    if (typeof qg.drift === "boolean") {
      gates.drift = qg.drift;
    }

    if (Object.keys(gates).length > 0) {
      result.qualityGates = gates;
    }
  }

  return result;
};
