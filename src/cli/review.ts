import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Command } from "commander";
import { handleAction } from "./handle-action.js";
import { projectRoot } from "./project-root.js";
import { createModelClient, createSdk } from "../agent/model/client.js";
import { createTelemetryLogger } from "../agent/telemetry/logger.js";
import { resolveDiff } from "../agent/review/diff.js";
import { assembleReviewContext } from "../agent/review/context.js";
import { reviewDiff, reviewWithPersonas } from "../agent/review/agent.js";
import {
  saveReviewSession,
  loadReviewSession,
  listReviewSessions,
} from "../agent/review/store.js";
import {
  formatReviewReport,
  formatPersonaReport,
  formatSessionList,
  filterBySeverity,
} from "../agent/review/format.js";
import { deriveCostFromSession } from "../agent/review/cost.js";
import { SEVERITIES, type Severity } from "../agent/review/types.js";
import type {
  ReviewSession,
  ReviewFinding,
  ThemeConclusion,
} from "../agent/review/types.js";
import { selectPersonas } from "../agent/review/orchestrator.js";
import {
  resolvePersonaSlugs,
  applyPersonaOverrides,
} from "../agent/review/personas.js";
import { deduplicateFindings } from "../agent/review/dedup.js";
import { extractThemes } from "../agent/review/themes.js";
import { verifyFindings } from "../agent/review/verify.js";
import { filterByConfidence } from "../agent/review/agent.js";
import {
  filterNoise,
  buildDismissalNoisePatterns,
  filterWithPatterns,
  type NoisePattern,
} from "../agent/review/noise-filter.js";
import { filterDismissedReRaises } from "../agent/review/dismissal/matcher.js";
import { filterWithJudge } from "../agent/review/dismissal/judge.js";
import type { ModelClient } from "../agent/model/client.js";
import { load as loadConfig } from "../config/config.js";
import {
  extractPRContext,
  buildLocalPRContext,
} from "../github/environment.js";
import { postReviewToGitHub } from "../github/adapter.js";
import {
  DISMISSAL_REASONS,
  isValidDismissalReason,
  UUID_RE,
} from "../agent/review/dismissal/types.js";
import type { Dismissal } from "../agent/review/dismissal/types.js";
import {
  appendDismissal,
  loadDismissals,
  loadRecentDismissals,
} from "../agent/review/dismissal/store.js";
import {
  computeDismissalStats,
  findCandidateNoisePatterns,
} from "../agent/review/dismissal/stats.js";
import {
  formatDismissalList,
  formatDismissalStats,
} from "../agent/review/dismissal/format.js";
import {
  createGitHubDismissalSource,
  findFindingInPR,
  formatDismissalReply,
  BRACKET_TAG_RE,
} from "../github/dismissals.js";
import { FINDING_MARKER_RE } from "../github/format.js";
import type { FilterStats } from "../agent/review/types.js";
import {
  replyToReviewComment,
  listPullRequestReviewComments,
} from "../github/client.js";

/** Default model for the LLM judge that detects semantic re-raises. */
const DEFAULT_JUDGE_MODEL = "claude-haiku-4-5-20251001";

const addTokenUsage = (
  a: { inputTokens: number; outputTokens: number },
  b: { inputTokens: number; outputTokens: number },
): { inputTokens: number; outputTokens: number } => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
});

/**
 * Shared filtering pipeline: confidence → noise (built-in + dynamic) → dismissal matcher.
 * Applied to both single-pass and persona review paths.
 */
const applyFilters = (
  findings: readonly ReviewFinding[],
  dismissals: readonly Dismissal[],
  dynamicNoisePatterns: readonly NoisePattern[] = [],
): { findings: readonly ReviewFinding[]; stats: FilterStats } => {
  const confidenceResult = filterByConfidence(findings);
  if (confidenceResult.filteredCount > 0) {
    console.error(
      `Filtered ${confidenceResult.filteredCount} low-confidence findings`,
    );
  }

  const noiseResult =
    dynamicNoisePatterns.length > 0
      ? filterWithPatterns(confidenceResult.findings, dynamicNoisePatterns)
      : filterNoise(confidenceResult.findings);
  if (noiseResult.filteredCount > 0) {
    const reasons = Object.entries(noiseResult.filteredReasons)
      .map(([reason, count]) => `${count} ${reason}`)
      .join(", ");
    console.error(
      `Filtered ${noiseResult.filteredCount} low-signal findings (${reasons})`,
    );
  }

  const dismissalResult = filterDismissedReRaises(
    noiseResult.findings,
    dismissals,
  );
  if (dismissalResult.filteredCount > 0) {
    console.error(
      `Filtered ${dismissalResult.filteredCount} dismissed re-raises`,
    );
  }

  return {
    findings: dismissalResult.findings,
    stats: {
      dismissalFilteredCount: dismissalResult.filteredCount,
      noiseFilteredCount: noiseResult.filteredCount,
      totalFilteredCount:
        confidenceResult.filteredCount +
        noiseResult.filteredCount +
        dismissalResult.filteredCount,
    },
  };
};

/**
 * Runs the LLM judge on post-filter findings and combines stats.
 * Shared between single-pass and persona review paths.
 */
const applyJudgeFilter = async (
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
  if (judgeResult.filteredCount > 0) {
    console.error(
      `LLM judge filtered ${judgeResult.filteredCount} semantic re-raises`,
    );
  }
  return {
    findings: judgeResult.findings,
    stats: {
      dismissalFilteredCount:
        filterResult.stats.dismissalFilteredCount + judgeResult.filteredCount,
      noiseFilteredCount: filterResult.stats.noiseFilteredCount,
      totalFilteredCount:
        filterResult.stats.totalFilteredCount + judgeResult.filteredCount,
    },
    tokenUsage: judgeResult.tokenUsage,
  };
};

export const reviewCommand = new Command("review")
  .enablePositionalOptions()
  .passThroughOptions()
  .description("Review code changes against project conventions")
  .option("--all", "Review working + staged changes (default: staged only)")
  .option(
    "--ref <ref>",
    "Review diff against ref (e.g., main, main...HEAD, abc..def)",
  )
  .option("--json", "Output as JSON")
  .option(
    "--min-severity <level>",
    "Minimum severity to display (critical, high, medium, low)",
  )
  .option("--list", "List past review sessions")
  .option("--show <id>", "Show findings from a past session")
  .option("--single", "Use single-pass review (no personas)")
  .option("--personas <slugs>", "Comma-separated list of persona slugs to use")
  .option("--no-dedup", "Skip cross-persona deduplication")
  .option(
    "--no-themes",
    "Skip cross-round theme extraction and prior findings injection",
  )
  .option("--no-verify", "Skip full-file verification pass")
  .option("--github-pr", "Post findings as GitHub PR review comments")
  .action(
    handleAction(
      async (opts: {
        all?: boolean;
        ref?: string;
        json?: boolean;
        minSeverity?: string;
        list?: boolean;
        show?: string;
        single?: boolean;
        personas?: string;
        dedup?: boolean;
        themes?: boolean;
        verify?: boolean;
        githubPr?: boolean;
      }) => {
        const rootDir = resolve(projectRoot());

        // Validate shared options early
        if (
          opts.minSeverity &&
          !(SEVERITIES as readonly string[]).includes(opts.minSeverity)
        ) {
          throw new Error(
            `Invalid severity: ${opts.minSeverity}. Valid: ${SEVERITIES.join(", ")}`,
          );
        }

        // List mode
        if (opts.list) {
          const sessions = listReviewSessions(rootDir);
          if (opts.json) {
            console.log(JSON.stringify(sessions, null, 2));
          } else {
            console.log(formatSessionList(sessions));
          }
          return;
        }

        // Show mode
        if (opts.show) {
          const { session, findings } = loadReviewSession(rootDir, opts.show);
          const filtered = opts.minSeverity
            ? filterBySeverity(findings, opts.minSeverity as Severity)
            : findings;

          // Build dismissal map for annotations
          const allDismissals = loadDismissals(rootDir);
          const dismissalMap = new Map<string, Dismissal>();
          for (const d of allDismissals) {
            dismissalMap.set(d.findingId, d);
          }

          if (opts.json) {
            console.log(
              JSON.stringify({ session, findings: filtered }, null, 2),
            );
          } else {
            if (session.mode === "personas") {
              console.log(
                formatPersonaReport(session, filtered, {
                  dismissals: dismissalMap,
                }),
              );
            } else {
              console.log(
                formatReviewReport(session, filtered, {
                  dismissals: dismissalMap,
                }),
              );
            }
          }
          return;
        }

        // Review mode
        if (!process.env.ANTHROPIC_API_KEY) {
          throw new Error(
            "ANTHROPIC_API_KEY environment variable is not set. " +
              "Set it to your Anthropic API key before running telesis review.",
          );
        }

        // Resolve diff
        const resolved = resolveDiff(rootDir, opts.ref, opts.all);
        if (resolved.diff.length === 0) {
          console.log(`No changes to review (${resolved.ref}).`);
          return;
        }

        // Assemble context
        const context = assembleReviewContext(rootDir);
        if (context.conventionsTruncated) {
          console.error(
            `Warning: review conventions truncated from ${context.conventionsTruncated.originalLength} to ${context.conventionsTruncated.truncatedLength} characters.`,
          );
        }

        // Load config for review settings
        const config = loadConfig(rootDir);
        const reviewConfig = config.review;

        // Create client
        const sessionId = randomUUID();
        const telemetry = createTelemetryLogger(rootDir);
        const sdk = createSdk();
        const client = createModelClient({
          sdk,
          telemetry,
          sessionId,
          component: "review",
        });
        const model = reviewConfig?.model ?? "claude-sonnet-4-6";

        // Load dismissed findings for suppression
        const dismissedFindings = loadRecentDismissals(rootDir);
        if (dismissedFindings.length > 0) {
          console.error(
            `Injecting ${dismissedFindings.length} dismissed findings for suppression`,
          );
        }

        // Build dynamic noise patterns from dismissal history
        const candidatePatterns = findCandidateNoisePatterns(dismissedFindings);
        const dynamicNoisePatterns =
          buildDismissalNoisePatterns(candidatePatterns);
        if (dynamicNoisePatterns.length > 0) {
          console.error(
            `${dynamicNoisePatterns.length} dynamic noise pattern(s) from dismissal history`,
          );
        }

        // Single-pass mode
        if (opts.single) {
          // Theme + prior findings extraction (same as persona path)
          const singleThemeResult =
            opts.themes !== false
              ? await extractThemes(rootDir, client, model)
              : {
                  themes: [] as readonly string[],
                  conclusions: [] as readonly ThemeConclusion[],
                  recentFindings: [] as readonly ReviewFinding[],
                };
          const singlePriorFindings = singleThemeResult.recentFindings;

          const result = await reviewDiff(
            client,
            resolved.diff,
            resolved.files,
            context,
            sessionId,
            model,
            singleThemeResult.themes,
            singleThemeResult.conclusions,
            singlePriorFindings,
            dismissedFindings,
          );

          // Verification pass (same as persona path)
          const singleVerifyResult =
            opts.verify !== false
              ? await verifyFindings(client, model, rootDir, result.findings)
              : { findings: result.findings, filteredCount: 0 };

          if (singleVerifyResult.filteredCount > 0) {
            console.error(
              `Verification filtered ${singleVerifyResult.filteredCount} false positive findings`,
            );
          }

          const rawFindingCount = singleVerifyResult.findings.length;
          const filterResult = applyFilters(
            singleVerifyResult.findings,
            dismissedFindings,
            dynamicNoisePatterns,
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
          let singleTokens = result.tokenUsage;
          if (singleThemeResult.tokenUsage) {
            singleTokens = addTokenUsage(
              singleTokens,
              singleThemeResult.tokenUsage,
            );
          }
          if (singleVerifyResult.tokenUsage) {
            singleTokens = addTokenUsage(
              singleTokens,
              singleVerifyResult.tokenUsage,
            );
          }
          if (judged.tokenUsage) {
            singleTokens = addTokenUsage(singleTokens, judged.tokenUsage);
          }

          const session: ReviewSession = {
            id: sessionId,
            timestamp: new Date().toISOString(),
            ref: resolved.ref,
            files: resolved.files,
            findingCount: finalFindings.length,
            model: result.model,
            durationMs: result.durationMs,
            tokenUsage: singleTokens,
            mode: "single",
          };

          saveSessionSafe(rootDir, session, finalFindings);
          const singleCost = deriveCostFromSession(session, rootDir);
          displayFindings(session, finalFindings, opts, {
            rawFindingCount,
            filterStats: combinedFilterStats,
            cost: singleCost,
          });
          if (opts.githubPr) {
            await postToGitHubSafe(session, finalFindings, {
              filterStats: combinedFilterStats,
              estimatedCost: singleCost,
            });
          }
          return;
        }

        // Persona mode (default)
        const startTime = Date.now();

        // Theme extraction (unless disabled)
        const themeResult =
          opts.themes !== false
            ? await extractThemes(rootDir, client, model)
            : {
                themes: [] as readonly string[],
                conclusions: [] as readonly ThemeConclusion[],
                recentFindings: [] as readonly ReviewFinding[],
              };

        // Prior findings come from the same session load that themes used
        const priorFindings = themeResult.recentFindings;

        // Resolve personas (config overrides applied to built-in definitions)
        const configOverrides = reviewConfig?.personas ?? [];
        const basePersonas = opts.personas
          ? resolvePersonaSlugs(opts.personas.split(",").map((s) => s.trim()))
          : selectPersonas(resolved.diff, resolved.files).personas;
        const personaDefs =
          configOverrides.length > 0
            ? applyPersonaOverrides(basePersonas, configOverrides)
            : basePersonas;

        const personaSlugs = personaDefs.map((p) => p.slug);

        // Parallel persona calls
        if (priorFindings.length > 0) {
          console.error(
            `Injecting ${priorFindings.length} prior findings for suppression`,
          );
        }

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
          opts.dedup !== false
            ? await deduplicateFindings(personaResults, client, model)
            : {
                findings: personaResults.flatMap((r) => [...r.findings]),
                mergedCount: 0,
              };

        // Verification pass (unless disabled)
        const verifyResult =
          opts.verify !== false
            ? await verifyFindings(client, model, rootDir, dedupResult.findings)
            : { findings: dedupResult.findings, filteredCount: 0 };

        if (verifyResult.filteredCount > 0) {
          console.error(
            `Verification filtered ${verifyResult.filteredCount} false positive findings`,
          );
        }

        const rawFindingCount = verifyResult.findings.length;
        const filterResult = applyFilters(
          verifyResult.findings,
          dismissedFindings,
          dynamicNoisePatterns,
        );

        const judged = await applyJudgeFilter(
          client,
          filterResult,
          dismissedFindings,
          reviewConfig?.judgeModel,
        );
        const finalFindings = judged.findings;
        const combinedFilterStats = judged.stats;

        // Aggregate token usage across persona calls + dedup + themes + verify + judge
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
          themes:
            themeResult.themes.length > 0 ? [...themeResult.themes] : undefined,
        };

        saveSessionSafe(rootDir, session, finalFindings);
        const personaCost = deriveCostFromSession(session, rootDir);
        displayFindings(session, finalFindings, opts, {
          mergedCount: dedupResult.mergedCount,
          rawFindingCount,
          filterStats: combinedFilterStats,
          cost: personaCost,
        });
        if (opts.githubPr) {
          await postToGitHubSafe(session, finalFindings, {
            mergedCount: dedupResult.mergedCount,
            filterStats: combinedFilterStats,
            estimatedCost: personaCost,
          });
        }
      },
    ),
  );

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

const displayFindings = (
  session: ReviewSession,
  findings: readonly ReviewFinding[],
  opts: {
    json?: boolean;
    minSeverity?: string;
  },
  extra?: {
    mergedCount?: number;
    rawFindingCount?: number;
    filterStats?: FilterStats;
    cost?: number | null;
  },
): void => {
  // "No new findings" message when all findings were filtered.
  // Intentionally exits 0: dismissed/noise-filtered findings are considered resolved.
  // The user has already triaged these — re-failing the build would defeat the purpose.
  if (
    findings.length === 0 &&
    extra?.rawFindingCount !== undefined &&
    extra.rawFindingCount > 0 &&
    extra.filterStats
  ) {
    if (opts.json) {
      console.log(
        JSON.stringify(
          { session, findings: [], filterStats: extra.filterStats },
          null,
          2,
        ),
      );
    } else {
      const { dismissalFilteredCount, noiseFilteredCount } = extra.filterStats;
      const parts: string[] = [];
      if (dismissalFilteredCount > 0) {
        parts.push(`${dismissalFilteredCount} dismissed re-raises`);
      }
      if (noiseFilteredCount > 0) {
        parts.push(`${noiseFilteredCount} noise`);
      }
      const detail = parts.length > 0 ? ` (${parts.join(", ")})` : "";
      console.log(
        `No new findings. ${extra.filterStats.totalFilteredCount} finding(s) filtered${detail}.`,
      );
    }
    return;
  }

  const filtered = opts.minSeverity
    ? filterBySeverity(findings, opts.minSeverity as Severity)
    : findings;

  if (opts.json) {
    console.log(JSON.stringify({ session, findings: filtered }, null, 2));
  } else if (session.mode === "personas") {
    console.log(
      formatPersonaReport(session, filtered, {
        mergedCount: extra?.mergedCount,
        cost: extra?.cost,
      }),
    );
  } else {
    console.log(formatReviewReport(session, filtered, { cost: extra?.cost }));
  }

  // Exit 1 if any critical or high findings (based on full results, not display filter)
  const hasCriticalOrHigh = findings.some(
    (f) => f.severity === "critical" || f.severity === "high",
  );
  if (hasCriticalOrHigh) {
    process.exitCode = 1;
  }
};

const postToGitHubSafe = async (
  session: ReviewSession,
  findings: readonly ReviewFinding[],
  extra?: {
    mergedCount?: number;
    filterStats?: FilterStats;
    estimatedCost?: number | null;
  },
): Promise<void> => {
  try {
    const ctx = extractPRContext();
    if (!ctx) {
      console.error(
        "Warning: --github-pr specified but no PR context detected. Skipping.",
      );
      return;
    }

    const result = await postReviewToGitHub(ctx, session, findings, extra);

    console.error(
      `Posted ${result.commentCount} inline comments to PR #${ctx.pullNumber}` +
        (result.summaryFindingCount > 0
          ? ` (${result.summaryFindingCount} as summary)`
          : ""),
    );
  } catch (err) {
    console.error(
      "Warning: could not post review to GitHub:",
      err instanceof Error ? err.message : err,
    );
  }
};

// --- Dismiss subcommand ---

type FindingIndex = ReadonlyMap<
  string,
  { finding: ReviewFinding; sessionId: string }
>;

const buildFindingIndex = (rootDir: string): FindingIndex => {
  const index = new Map<
    string,
    { finding: ReviewFinding; sessionId: string }
  >();
  const sessions = listReviewSessions(rootDir);
  for (const session of sessions) {
    try {
      const loaded = loadReviewSession(rootDir, session.id);
      for (const finding of loaded.findings) {
        index.set(finding.id, { finding, sessionId: session.id });
      }
    } catch {
      // skip unreadable sessions
    }
  }
  return index;
};

const dismissCommand = new Command("dismiss")
  .description("Dismiss a review finding")
  .argument("<finding-id>", "The finding ID to dismiss")
  .requiredOption(
    "--reason <category>",
    `Dismissal reason (${DISMISSAL_REASONS.join(", ")})`,
  )
  .option("--note <text>", "Optional free-text note")
  .option(
    "--pr <number>",
    "PR number to search for finding (when not in local sessions)",
  )
  .action(
    handleAction(
      async (
        findingId: string,
        opts: { reason: string; note?: string; pr?: string },
      ) => {
        const rootDir = resolve(projectRoot());

        if (!isValidDismissalReason(opts.reason)) {
          throw new Error(
            `Invalid reason: ${opts.reason}. Valid: ${DISMISSAL_REASONS.join(", ")}`,
          );
        }

        // Try local sessions first
        const findingIndex = buildFindingIndex(rootDir);
        const localResult = findingIndex.get(findingId) ?? null;

        if (localResult) {
          const { finding, sessionId } = localResult;

          // Show finding context before dismissal
          const location = finding.startLine
            ? `${finding.path}:${finding.startLine}`
            : finding.path;
          const persona = finding.persona
            ? ` (${finding.persona} persona)`
            : "";
          console.log(
            `  ${location} [${finding.severity}/${finding.category}]${persona}`,
          );
          console.log(`  ${finding.description}`);
          if (finding.suggestion) {
            console.log(`  > Suggestion: ${finding.suggestion}`);
          }

          const dismissal: Dismissal = {
            id: randomUUID(),
            findingId: finding.id,
            sessionId,
            reason: opts.reason,
            timestamp: new Date().toISOString(),
            source: "cli",
            path: finding.path,
            severity: finding.severity,
            category: finding.category,
            description: finding.description,
            suggestion: finding.suggestion,
            startLine: finding.startLine,
            persona: finding.persona,
            note: opts.note,
          };

          appendDismissal(rootDir, dismissal);
          console.log(
            `Dismissed: ${finding.path} [${finding.severity}/${finding.category}] — ${opts.reason}`,
          );
          return;
        }

        // Fall back to GitHub PR comments
        if (!opts.pr) {
          throw new Error(
            `Finding not found in local sessions: ${findingId}. ` +
              "Use --pr <number> to search GitHub PR comments, or " +
              "`telesis review --list` to see local sessions.",
          );
        }

        const pullNumber = parseInt(opts.pr, 10);
        if (!Number.isFinite(pullNumber) || pullNumber <= 0) {
          throw new Error(`Invalid PR number: ${opts.pr}`);
        }

        const ctx = extractPRContext() ?? buildLocalPRContext(pullNumber);
        if (!ctx) {
          throw new Error(
            "Could not determine repository context. " +
              "Ensure GITHUB_TOKEN is set and you are in a repository " +
              "with a GitHub remote.",
          );
        }

        const prCtx = { ...ctx, pullNumber };
        const lookup = await findFindingInPR(prCtx, findingId);
        if (!lookup) {
          throw new Error(
            `Finding not found in local sessions or PR #${pullNumber}: ${findingId}.`,
          );
        }

        const { finding: prFinding } = lookup;

        // Show finding context before dismissal
        console.log(
          `  ${prFinding.path} [${prFinding.severity}/${prFinding.category}]${prFinding.persona ? ` (${prFinding.persona} persona)` : ""}`,
        );
        console.log(`  ${prFinding.description}`);
        if (prFinding.suggestion) {
          console.log(`  > Suggestion: ${prFinding.suggestion}`);
        }

        const dismissal: Dismissal = {
          id: randomUUID(),
          findingId: prFinding.findingId,
          sessionId: "github",
          reason: opts.reason,
          timestamp: new Date().toISOString(),
          source: "cli",
          path: prFinding.path,
          severity: prFinding.severity,
          category: prFinding.category,
          description: prFinding.description,
          suggestion: prFinding.suggestion,
          persona: prFinding.persona,
          note: opts.note,
        };

        appendDismissal(rootDir, dismissal);
        console.log(
          `Dismissed: ${prFinding.path} [${prFinding.severity}/${prFinding.category}] — ${opts.reason}`,
        );
        console.log(
          `Run \`telesis review sync-replies --pr ${pullNumber}\` to post reply to GitHub.`,
        );
      },
    ),
  );

// --- Dismissals list subcommand ---

const dismissalsCommand = new Command("dismissals")
  .description("List all dismissals")
  .option("--json", "Output as JSON")
  .action(
    handleAction(async (opts: { json?: boolean }) => {
      const rootDir = resolve(projectRoot());
      const dismissals = loadDismissals(rootDir);

      if (opts.json) {
        console.log(JSON.stringify(dismissals, null, 2));
      } else {
        console.log(formatDismissalList(dismissals));
      }
    }),
  );

// --- Dismissal stats subcommand ---

const dismissalStatsCommand = new Command("dismissal-stats")
  .description("Show aggregated dismissal statistics")
  .option("--json", "Output as JSON")
  .action(
    handleAction(async (opts: { json?: boolean }) => {
      const rootDir = resolve(projectRoot());
      const dismissals = loadDismissals(rootDir);
      const stats = computeDismissalStats(dismissals);
      const patterns = findCandidateNoisePatterns(dismissals);

      if (opts.json) {
        console.log(JSON.stringify({ stats, patterns }, null, 2));
      } else {
        console.log(formatDismissalStats(stats, patterns));
      }
    }),
  );

// --- Sync dismissals subcommand ---

const syncDismissalsCommand = new Command("sync-dismissals")
  .description("Import dismissal signals from GitHub PR review threads")
  .requiredOption("--pr <number>", "Pull request number")
  .action(
    handleAction(async (opts: { pr: string }) => {
      const rootDir = resolve(projectRoot());

      const pullNumber = parseInt(opts.pr, 10);
      if (!Number.isFinite(pullNumber) || pullNumber <= 0) {
        throw new Error(`Invalid PR number: ${opts.pr}`);
      }

      const token = process.env.GITHUB_TOKEN;
      if (!token) {
        throw new Error(
          "GITHUB_TOKEN environment variable is not set. " +
            "Set it to a token with pull-requests:read permission.",
        );
      }

      // Try CI context first, fall back to local git remote
      const ctx = extractPRContext() ?? buildLocalPRContext(pullNumber);
      if (!ctx) {
        throw new Error(
          "Could not determine repository context. " +
            "Ensure GITHUB_TOKEN is set and you are in a repository " +
            "with a GitHub remote.",
        );
      }

      const source = createGitHubDismissalSource({
        ...ctx,
        pullNumber,
      });

      const signals = await source.fetchDismissals();

      if (signals.length === 0) {
        console.log("No dismissal signals found in PR review threads.");
        return;
      }

      // Build index once for all signals (O(sessions + signals) instead of O(sessions × signals))
      const findingIndex = buildFindingIndex(rootDir);

      let imported = 0;
      let failed = 0;
      for (const signal of signals) {
        // Look up the original finding for full metadata
        const result = signal.findingId
          ? (findingIndex.get(signal.findingId) ?? null)
          : null;

        const dismissal: Dismissal = {
          id: randomUUID(),
          findingId: signal.findingId ?? "unknown",
          sessionId: result?.sessionId ?? "unknown",
          reason: signal.reason,
          timestamp: new Date().toISOString(),
          source: "github",
          path: result?.finding.path ?? signal.path,
          severity: result?.finding.severity ?? "medium",
          category: result?.finding.category ?? "bug",
          description: result?.finding.description ?? signal.description,
          suggestion: result?.finding.suggestion ?? "",
          persona: result?.finding.persona,
          note: `Imported from ${signal.platformRef}`,
        };

        try {
          appendDismissal(rootDir, dismissal);
          imported++;
        } catch (err) {
          failed++;
          console.error(
            `Warning: failed to write dismissal for ${signal.path}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }

      const parts = [
        `Imported ${imported} dismissal${imported === 1 ? "" : "s"} from PR #${pullNumber}.`,
      ];
      if (failed > 0) {
        parts.push(`${failed} failed to write.`);
      }
      console.log(parts.join(" "));
    }),
  );

// --- Sync replies subcommand ---

const syncRepliesCommand = new Command("sync-replies")
  .description("Post dismissal replies to GitHub PR review comment threads")
  .requiredOption("--pr <number>", "Pull request number")
  .action(
    handleAction(async (opts: { pr: string }) => {
      const rootDir = resolve(projectRoot());

      const pullNumber = parseInt(opts.pr, 10);
      if (!Number.isFinite(pullNumber) || pullNumber <= 0) {
        throw new Error(`Invalid PR number: ${opts.pr}`);
      }

      const token = process.env.GITHUB_TOKEN;
      if (!token) {
        throw new Error(
          "GITHUB_TOKEN environment variable is not set. " +
            "Set it to a token with pull-requests:write permission.",
        );
      }

      const ctx = extractPRContext() ?? buildLocalPRContext(pullNumber);
      if (!ctx) {
        throw new Error(
          "Could not determine repository context. " +
            "Ensure GITHUB_TOKEN is set and you are in a repository " +
            "with a GitHub remote.",
        );
      }

      const prCtx = { ...ctx, pullNumber };

      // Only sync locally-created dismissals (not those imported from GitHub)
      const allDismissals = loadDismissals(rootDir);
      const cliDismissals = allDismissals.filter(
        (d) => d.source === "cli" && UUID_RE.test(d.findingId),
      );

      if (cliDismissals.length === 0) {
        console.log("No CLI dismissals to sync.");
        return;
      }

      // Fetch all PR review comments
      const comments = await listPullRequestReviewComments(prCtx);

      // Index root comments by ID for O(1) lookup
      const commentsById = new Map(comments.map((c) => [c.id, c]));

      // Build a map: findingId → root comment ID (from markers)
      const findingToCommentId = new Map<string, number>();
      for (const c of comments) {
        if (c.in_reply_to_id != null) continue;
        const match = FINDING_MARKER_RE.exec(c.body);
        if (match?.[1]) {
          findingToCommentId.set(match[1], c.id);
        }
      }

      // Build a set of findingIds that already have bracket-tag replies
      const alreadySynced = new Set<string>();
      for (const c of comments) {
        if (c.in_reply_to_id == null) continue;
        if (!BRACKET_TAG_RE.test(c.body)) continue;
        const rootComment = commentsById.get(c.in_reply_to_id);
        if (rootComment && rootComment.in_reply_to_id == null) {
          const match = FINDING_MARKER_RE.exec(rootComment.body);
          if (match?.[1]) {
            alreadySynced.add(match[1]);
          }
        }
      }

      let synced = 0;
      let skipped = 0;
      let noComment = 0;

      for (const dismissal of cliDismissals) {
        if (alreadySynced.has(dismissal.findingId)) {
          skipped++;
          continue;
        }

        const commentId = findingToCommentId.get(dismissal.findingId);
        if (!commentId) {
          noComment++;
          continue;
        }

        const replyBody = formatDismissalReply(
          dismissal.reason,
          dismissal.note,
        );
        try {
          await replyToReviewComment(prCtx, commentId, replyBody);
          synced++;
        } catch (err) {
          console.error(
            `Warning: failed to post reply for ${dismissal.findingId}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }

      const parts = [
        `Synced ${synced} repl${synced === 1 ? "y" : "ies"} to PR #${pullNumber}.`,
      ];
      if (skipped > 0) {
        parts.push(`${skipped} already synced.`);
      }
      if (noComment > 0) {
        parts.push(`${noComment} had no matching PR comment.`);
      }
      console.log(parts.join(" "));
    }),
  );

// Register subcommands on review
reviewCommand.addCommand(dismissCommand);
reviewCommand.addCommand(dismissalsCommand);
reviewCommand.addCommand(dismissalStatsCommand);
reviewCommand.addCommand(syncDismissalsCommand);
reviewCommand.addCommand(syncRepliesCommand);
