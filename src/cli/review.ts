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
import { SEVERITIES, type Severity } from "../agent/review/types.js";
import type { ReviewSession, ReviewFinding } from "../agent/review/types.js";
import { selectPersonas } from "../agent/review/orchestrator.js";
import {
  resolvePersonaSlugs,
  applyPersonaOverrides,
} from "../agent/review/personas.js";
import { deduplicateFindings } from "../agent/review/dedup.js";
import { extractThemes } from "../agent/review/themes.js";
import { load as loadConfig } from "../config/config.js";

const addTokenUsage = (
  a: { inputTokens: number; outputTokens: number },
  b: { inputTokens: number; outputTokens: number },
): { inputTokens: number; outputTokens: number } => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
});

export const reviewCommand = new Command("review")
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
  .option("--no-themes", "Skip cross-round theme extraction")
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
          if (opts.json) {
            console.log(
              JSON.stringify({ session, findings: filtered }, null, 2),
            );
          } else {
            if (session.mode === "personas") {
              console.log(formatPersonaReport(session, filtered));
            } else {
              console.log(formatReviewReport(session, filtered));
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

        // Single-pass mode
        if (opts.single) {
          const result = await reviewDiff(
            client,
            resolved.diff,
            resolved.files,
            context,
            sessionId,
            model,
          );

          const session: ReviewSession = {
            id: sessionId,
            timestamp: new Date().toISOString(),
            ref: resolved.ref,
            files: resolved.files,
            findingCount: result.findings.length,
            model: result.model,
            durationMs: result.durationMs,
            tokenUsage: result.tokenUsage,
            mode: "single",
          };

          saveSessionSafe(rootDir, session, result.findings);
          displayAndExit(session, result.findings, opts);
          return;
        }

        // Persona mode (default)
        const startTime = Date.now();

        // Theme extraction (unless disabled)
        const themeResult =
          opts.themes !== false
            ? await extractThemes(rootDir, client, model)
            : { themes: [] as readonly string[] };

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
        const personaResults = await reviewWithPersonas(
          client,
          resolved.diff,
          resolved.files,
          context,
          sessionId,
          model,
          personaDefs,
          themeResult.themes,
        );

        // Deduplication (unless disabled)
        const dedupResult =
          opts.dedup !== false
            ? await deduplicateFindings(personaResults, client, model)
            : {
                findings: personaResults.flatMap((r) => [...r.findings]),
                mergedCount: 0,
              };

        // Aggregate token usage across persona calls + dedup + themes
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

        const durationMs = Date.now() - startTime;

        const session: ReviewSession = {
          id: sessionId,
          timestamp: new Date().toISOString(),
          ref: resolved.ref,
          files: resolved.files,
          findingCount: dedupResult.findings.length,
          model,
          durationMs,
          tokenUsage: totalTokens,
          mode: "personas",
          personas: personaSlugs,
          themes:
            themeResult.themes.length > 0 ? [...themeResult.themes] : undefined,
        };

        saveSessionSafe(rootDir, session, dedupResult.findings);
        displayAndExit(session, dedupResult.findings, opts, {
          mergedCount: dedupResult.mergedCount,
        });
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

const displayAndExit = (
  session: ReviewSession,
  findings: readonly ReviewFinding[],
  opts: {
    json?: boolean;
    minSeverity?: string;
  },
  extra?: { mergedCount?: number },
): void => {
  const filtered = opts.minSeverity
    ? filterBySeverity(findings, opts.minSeverity as Severity)
    : findings;

  if (opts.json) {
    console.log(JSON.stringify({ session, findings: filtered }, null, 2));
  } else if (session.mode === "personas") {
    console.log(
      formatPersonaReport(session, filtered, {
        mergedCount: extra?.mergedCount,
      }),
    );
  } else {
    console.log(formatReviewReport(session, filtered));
  }

  // Exit 1 if any critical or high findings (based on full results, not display filter)
  const hasCriticalOrHigh = findings.some(
    (f) => f.severity === "critical" || f.severity === "high",
  );
  if (hasCriticalOrHigh) {
    process.exitCode = 1;
  }
};
