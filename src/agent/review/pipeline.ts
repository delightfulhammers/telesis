import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { ModelClient } from "../model/client.js";
import { resolveDiff } from "./diff.js";
import { assembleReviewContext } from "./context.js";
import {
  reviewDiff,
  reviewWithPersonas,
  filterByConfidence,
  escalateThresholds,
} from "./agent.js";
import { saveReviewSession } from "./store.js";
import { deriveCostFromSession } from "./cost.js";
import {
  DEFAULT_CONFIDENCE_THRESHOLDS,
  type ReviewSession,
  type ReviewFinding,
  type ReviewContext,
  type ResolvedDiff,
  type ThemeConclusion,
  type FilterStats,
} from "./types.js";
import { selectPersonas } from "./orchestrator.js";
import { resolvePersonaSlugs, applyPersonaOverrides } from "./personas.js";
import { deduplicateFindings } from "./dedup.js";
import {
  extractThemes,
  filterByAntiPatterns,
  filterActiveThemes,
} from "./themes.js";
import { verifyFindings } from "./verify.js";
import {
  filterNoise,
  buildDismissalNoisePatterns,
  filterWithPatterns,
  type NoisePattern,
} from "./noise-filter.js";
import { filterDismissedReRaises } from "./dismissal/matcher.js";
import { filterWithJudge } from "./dismissal/judge.js";
import { loadRecentDismissals } from "./dismissal/store.js";
import { findCandidateNoisePatterns } from "./dismissal/stats.js";
import { load as loadConfig } from "../../config/config.js";
import type { ReviewConfig } from "../../config/config.js";
import {
  labelFindings,
  loadPriorFindings,
  listPriorSessions,
  summarizeConvergence,
} from "./convergence.js";
import type { ConvergenceSummary, LabeledFinding } from "./convergence.js";
import type { Dismissal } from "./dismissal/types.js";

/** Default model for the LLM judge that detects semantic re-raises. */
const DEFAULT_JUDGE_MODEL = "claude-haiku-4-5-20251001";

export interface ReviewOptions {
  readonly ref?: string;
  readonly all?: boolean;
  readonly single?: boolean;
  readonly personas?: string;
  readonly dedup?: boolean;
  readonly themes?: boolean;
  readonly verify?: boolean;
  readonly sessionId?: string;
}

export interface ReviewResult {
  readonly session: ReviewSession;
  readonly findings: readonly ReviewFinding[];
  readonly convergence?: ConvergenceSummary;
  readonly labeledFindings?: readonly LabeledFinding[];
  readonly filterStats: FilterStats;
  readonly cost: number | null;
  readonly rawFindingCount: number;
  readonly mergedCount?: number;
  readonly activeThemes?: readonly string[];
  readonly conventionsTruncated?: {
    readonly originalLength: number;
    readonly truncatedLength: number;
  };
  readonly noChanges?: boolean;
  readonly noChangesRef?: string;
}

const addTokenUsage = (
  a: { inputTokens: number; outputTokens: number },
  b: { inputTokens: number; outputTokens: number },
): { inputTokens: number; outputTokens: number } => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
});

/**
 * Shared filtering pipeline:
 *   confidence (round-escalated) → noise → dismissal → anti-pattern.
 */
export const applyFilters = (
  findings: readonly ReviewFinding[],
  dismissals: readonly Dismissal[],
  dynamicNoisePatterns: readonly NoisePattern[] = [],
  round: number = 1,
  conclusions: readonly ThemeConclusion[] = [],
): { findings: readonly ReviewFinding[]; stats: FilterStats } => {
  const thresholds = escalateThresholds(DEFAULT_CONFIDENCE_THRESHOLDS, round);
  const confidenceResult = filterByConfidence(findings, thresholds);

  const noiseResult =
    dynamicNoisePatterns.length > 0
      ? filterWithPatterns(confidenceResult.findings, dynamicNoisePatterns)
      : filterNoise(confidenceResult.findings);

  const dismissalResult = filterDismissedReRaises(
    noiseResult.findings,
    dismissals,
  );

  const antiPatternResult = filterByAntiPatterns(
    dismissalResult.findings,
    conclusions,
  );

  return {
    findings: antiPatternResult.findings,
    stats: {
      dismissalFilteredCount: dismissalResult.filteredCount,
      noiseFilteredCount: noiseResult.filteredCount,
      antiPatternFilteredCount: antiPatternResult.filteredCount,
      totalFilteredCount:
        confidenceResult.filteredCount +
        noiseResult.filteredCount +
        dismissalResult.filteredCount +
        antiPatternResult.filteredCount,
    },
  };
};

/**
 * Runs the LLM judge on post-filter findings and combines stats.
 */
export const applyJudgeFilter = async (
  client: ModelClient,
  filterResult: { findings: readonly ReviewFinding[]; stats: FilterStats },
  dismissals: readonly Dismissal[],
  judgeModel: string = DEFAULT_JUDGE_MODEL,
): Promise<{
  findings: readonly ReviewFinding[];
  stats: FilterStats;
  tokenUsage?: { inputTokens: number; outputTokens: number };
}> => {
  const judgeResult = await filterWithJudge(
    client,
    judgeModel,
    filterResult.findings,
    dismissals,
  );

  return {
    findings: judgeResult.findings,
    stats: {
      dismissalFilteredCount:
        filterResult.stats.dismissalFilteredCount + judgeResult.filteredCount,
      noiseFilteredCount: filterResult.stats.noiseFilteredCount,
      antiPatternFilteredCount: filterResult.stats.antiPatternFilteredCount,
      totalFilteredCount:
        filterResult.stats.totalFilteredCount + judgeResult.filteredCount,
    },
    tokenUsage: judgeResult.tokenUsage,
  };
};

/**
 * Runs the full review pipeline: diff resolution, context assembly,
 * persona/single-pass review, filtering, convergence detection.
 *
 * Returns structured data — the caller decides how to present it
 * (CLI formatting vs MCP JSON).
 *
 * The caller constructs and injects the ModelClient — this function
 * does not create its own SDK instance or check for API keys.
 */
export const runReview = async (
  client: ModelClient,
  rootDir: string,
  options: ReviewOptions,
): Promise<ReviewResult> => {
  const resolvedRootDir = resolve(rootDir);

  // Resolve diff
  const resolved = resolveDiff(resolvedRootDir, options.ref, options.all);
  if (resolved.diff.length === 0) {
    const emptyStats: FilterStats = {
      dismissalFilteredCount: 0,
      noiseFilteredCount: 0,
      antiPatternFilteredCount: 0,
      totalFilteredCount: 0,
    };
    return {
      session: {
        id: options.sessionId ?? randomUUID(),
        timestamp: new Date().toISOString(),
        ref: resolved.ref,
        files: [],
        findingCount: 0,
        model: "",
        durationMs: 0,
        tokenUsage: { inputTokens: 0, outputTokens: 0 },
        mode: "single",
      },
      findings: [],
      filterStats: emptyStats,
      cost: null,
      rawFindingCount: 0,
      noChanges: true,
      noChangesRef: resolved.ref,
    };
  }

  // Assemble context
  const context = assembleReviewContext(resolvedRootDir);

  // Load config for review settings
  const config = loadConfig(resolvedRootDir);
  const reviewConfig = config.review;

  const sessionId = options.sessionId ?? randomUUID();
  const model = reviewConfig?.model ?? "claude-sonnet-4-6";

  // Load dismissed findings for suppression (best-effort — corrupt file degrades gracefully)
  let dismissedFindings: readonly Dismissal[] = [];
  let dynamicNoisePatterns: readonly NoisePattern[] = [];
  try {
    dismissedFindings = loadRecentDismissals(resolvedRootDir);
    const candidatePatterns = findCandidateNoisePatterns(dismissedFindings);
    dynamicNoisePatterns = buildDismissalNoisePatterns(candidatePatterns);
  } catch (err) {
    console.error(
      "Warning: could not load dismissals for suppression:",
      err instanceof Error ? err.message : err,
    );
  }

  const passArgs = {
    rootDir: resolvedRootDir,
    client,
    model,
    sessionId,
    resolved,
    context,
    reviewConfig,
    dismissedFindings,
    dynamicNoisePatterns,
    options,
  };

  const result = options.single
    ? await runSinglePass(passArgs)
    : await runPersonaPass(passArgs);

  return {
    ...result,
    conventionsTruncated: context.conventionsTruncated,
  };
};

interface PassArgs {
  readonly rootDir: string;
  readonly client: ModelClient;
  readonly model: string;
  readonly sessionId: string;
  readonly resolved: ResolvedDiff;
  readonly context: ReviewContext;
  readonly reviewConfig: ReviewConfig | undefined;
  readonly dismissedFindings: readonly Dismissal[];
  readonly dynamicNoisePatterns: readonly NoisePattern[];
  readonly options: ReviewOptions;
}

const runSinglePass = async (args: PassArgs): Promise<ReviewResult> => {
  const {
    rootDir,
    client,
    model,
    sessionId,
    resolved,
    context,
    reviewConfig,
    dismissedFindings,
    dynamicNoisePatterns,
    options,
  } = args;

  // Theme + prior findings extraction
  const themeResult =
    options.themes !== false
      ? await extractThemes(rootDir, client, model)
      : {
          themes: [] as readonly string[],
          conclusions: [] as readonly ThemeConclusion[],
          recentFindings: [] as readonly ReviewFinding[],
        };

  const result = await reviewDiff(
    client,
    resolved.diff,
    resolved.files,
    context,
    sessionId,
    model,
    themeResult.themes,
    themeResult.conclusions,
    themeResult.recentFindings,
    dismissedFindings,
  );

  // Verification pass
  const verifyResult =
    options.verify !== false
      ? await verifyFindings(client, model, rootDir, result.findings)
      : { findings: result.findings, filteredCount: 0 };

  // Prior sessions for round escalation and convergence
  const priorSessions = listPriorSessions(
    rootDir,
    resolved.ref,
    sessionId,
    undefined,
    resolved.files,
  );
  const round = priorSessions.length + 1;

  const rawFindingCount = verifyResult.findings.length;
  const filterResult = applyFilters(
    verifyResult.findings,
    dismissedFindings,
    dynamicNoisePatterns,
    round,
    themeResult.conclusions,
  );

  const judged = await applyJudgeFilter(
    client,
    filterResult,
    dismissedFindings,
    reviewConfig?.judgeModel,
  );
  const finalFindings = judged.findings;
  const combinedFilterStats = judged.stats;

  // Aggregate token usage
  let tokens = result.tokenUsage;
  if (themeResult.tokenUsage) {
    tokens = addTokenUsage(tokens, themeResult.tokenUsage);
  }
  if (verifyResult.tokenUsage) {
    tokens = addTokenUsage(tokens, verifyResult.tokenUsage);
  }
  if (judged.tokenUsage) {
    tokens = addTokenUsage(tokens, judged.tokenUsage);
  }

  const session: ReviewSession = {
    id: sessionId,
    timestamp: new Date().toISOString(),
    ref: resolved.ref,
    files: resolved.files,
    findingCount: finalFindings.length,
    model: result.model,
    durationMs: result.durationMs,
    tokenUsage: tokens,
    mode: "single",
  };

  saveSessionSafe(rootDir, session, finalFindings);

  // Convergence detection
  const priors = loadPriorFindings(
    rootDir,
    resolved.ref,
    sessionId,
    undefined,
    resolved.files,
  );
  const labeled = labelFindings(finalFindings, priors);
  const convergence = summarizeConvergence(labeled, priorSessions);

  const activeThemes = session.themes
    ? filterActiveThemes(session.themes, finalFindings)
    : undefined;
  const cost = deriveCostFromSession(session, rootDir);

  return {
    session,
    findings: finalFindings,
    convergence,
    labeledFindings: labeled,
    filterStats: combinedFilterStats,
    cost,
    rawFindingCount,
    activeThemes,
  };
};

const runPersonaPass = async (args: PassArgs): Promise<ReviewResult> => {
  const {
    rootDir,
    client,
    model,
    sessionId,
    resolved,
    context,
    reviewConfig,
    dismissedFindings,
    dynamicNoisePatterns,
    options,
  } = args;

  const startTime = Date.now();

  // Theme extraction (unless disabled)
  const themeResult =
    options.themes !== false
      ? await extractThemes(rootDir, client, model)
      : {
          themes: [] as readonly string[],
          conclusions: [] as readonly ThemeConclusion[],
          recentFindings: [] as readonly ReviewFinding[],
        };

  const priorFindings = themeResult.recentFindings;

  // Resolve personas (config overrides applied to built-in definitions)
  const configOverrides = reviewConfig?.personas ?? [];
  const basePersonas = options.personas
    ? resolvePersonaSlugs(options.personas.split(",").map((s) => s.trim()))
    : selectPersonas(resolved.diff, resolved.files).personas;
  const personaDefs =
    configOverrides.length > 0
      ? applyPersonaOverrides(basePersonas, configOverrides)
      : basePersonas;

  const personaSlugs = personaDefs.map((p) => p.slug);

  // Parallel persona calls
  const personaResults = await reviewWithPersonas(
    client,
    resolved.diff,
    resolved.files,
    context,
    sessionId,
    model,
    personaDefs,
    themeResult.themes,
    themeResult.conclusions,
    priorFindings,
    dismissedFindings,
  );

  // Deduplication (unless disabled)
  const dedupResult =
    options.dedup !== false
      ? await deduplicateFindings(personaResults, client, model)
      : {
          findings: personaResults.flatMap((r) => [...r.findings]),
          mergedCount: 0,
        };

  // Verification pass (unless disabled)
  const verifyResult =
    options.verify !== false
      ? await verifyFindings(client, model, rootDir, dedupResult.findings)
      : { findings: dedupResult.findings, filteredCount: 0 };

  // Prior sessions for round escalation and convergence
  const personaPriorSessions = listPriorSessions(
    rootDir,
    resolved.ref,
    sessionId,
    undefined,
    resolved.files,
  );
  const personaRound = personaPriorSessions.length + 1;

  const rawFindingCount = verifyResult.findings.length;
  const filterResult = applyFilters(
    verifyResult.findings,
    dismissedFindings,
    dynamicNoisePatterns,
    personaRound,
    themeResult.conclusions,
  );

  const judged = await applyJudgeFilter(
    client,
    filterResult,
    dismissedFindings,
    reviewConfig?.judgeModel,
  );
  const finalFindings = judged.findings;
  const combinedFilterStats = judged.stats;

  // Aggregate token usage
  let totalTokens = personaResults.reduce(
    (acc, r) => addTokenUsage(acc, r.tokenUsage),
    { inputTokens: 0, outputTokens: 0 },
  );
  if (dedupResult.tokenUsage) {
    totalTokens = addTokenUsage(totalTokens, dedupResult.tokenUsage);
  }
  if (themeResult.tokenUsage) {
    totalTokens = addTokenUsage(totalTokens, themeResult.tokenUsage);
  }
  if (verifyResult.tokenUsage) {
    totalTokens = addTokenUsage(totalTokens, verifyResult.tokenUsage);
  }
  if (judged.tokenUsage) {
    totalTokens = addTokenUsage(totalTokens, judged.tokenUsage);
  }

  const durationMs = Date.now() - startTime;

  const session: ReviewSession = {
    id: sessionId,
    timestamp: new Date().toISOString(),
    ref: resolved.ref,
    files: resolved.files,
    findingCount: finalFindings.length,
    model,
    durationMs,
    tokenUsage: totalTokens,
    mode: "personas",
    personas: personaSlugs,
    themes: themeResult.themes.length > 0 ? [...themeResult.themes] : undefined,
  };

  saveSessionSafe(rootDir, session, finalFindings);

  // Convergence detection
  const convergencePriors = loadPriorFindings(
    rootDir,
    resolved.ref,
    sessionId,
    undefined,
    resolved.files,
  );
  const convergenceLabeled = labelFindings(finalFindings, convergencePriors);
  const convergence = summarizeConvergence(
    convergenceLabeled,
    personaPriorSessions,
  );

  const activeThemes = session.themes
    ? filterActiveThemes(session.themes, finalFindings)
    : undefined;
  const cost = deriveCostFromSession(session, rootDir);

  return {
    session,
    findings: finalFindings,
    convergence,
    labeledFindings: convergenceLabeled,
    filterStats: combinedFilterStats,
    cost,
    rawFindingCount,
    mergedCount: dedupResult.mergedCount,
    activeThemes,
  };
};

const saveSessionSafe = (
  rootDir: string,
  session: ReviewSession,
  findings: readonly ReviewFinding[],
): void => {
  try {
    saveReviewSession(rootDir, session, findings);
  } catch (err) {
    console.error(
      "Warning: could not save review session:",
      err instanceof Error ? err.message : err,
    );
  }
};
