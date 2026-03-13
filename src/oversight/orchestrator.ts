import type { TelesisDaemonEvent } from "../daemon/types.js";
import { createEvent } from "../daemon/types.js";
import { assembleDispatchContext } from "../dispatch/context.js";
import { loadAllPolicies } from "./policy.js";
import { createObserver } from "./observer.js";
import { createReviewerAnalyzer } from "./reviewer.js";
import { createArchitectAnalyzer } from "./architect.js";
import { createChroniclerAnalyzer } from "./chronicler.js";
import type {
  Observer,
  OversightDeps,
  OversightOrchestrator,
  OversightSummary,
  PolicyFile,
} from "./types.js";

/** Map observer name to its analyzer factory */
const createAnalyzerForPolicy = (deps: OversightDeps, policy: PolicyFile) => {
  switch (policy.name) {
    case "reviewer":
      return createReviewerAnalyzer(deps.modelClient, policy, deps.sessionId);
    case "architect":
      return createArchitectAnalyzer(deps.modelClient, policy, deps.sessionId);
    case "chronicler":
      return createChroniclerAnalyzer(
        deps.modelClient,
        policy,
        deps.sessionId,
        deps.rootDir,
      );
    default:
      return null;
  }
};

/** Create the oversight orchestrator that wires observers to the dispatch event stream */
export const createOversightOrchestrator = (
  deps: OversightDeps,
): OversightOrchestrator | null => {
  const policies = loadAllPolicies(deps.rootDir);
  const enabledPolicies = policies.filter((p) => p.enabled);

  if (enabledPolicies.length === 0) return null;

  let context;
  try {
    context = assembleDispatchContext(deps.rootDir);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`oversight: failed to assemble context: ${msg}`);
    return null;
  }

  const observers: Observer[] = [];

  for (const policy of enabledPolicies) {
    const analyzeFn = createAnalyzerForPolicy(deps, policy);
    if (!analyzeFn) continue;

    observers.push(createObserver({ policy, analyzeFn, context }));
  }

  if (observers.length === 0) return null;

  let intervened = false;

  const emitFinding = (
    observer: Observer,
    finding: { readonly severity: string; readonly summary: string },
  ): void => {
    if (observer.policy.autonomy === "observe") return;

    deps.onEvent(
      createEvent("oversight:finding", {
        sessionId: deps.sessionId,
        observer: observer.name,
        severity: finding.severity,
        summary: finding.summary,
      }),
    );

    if (
      observer.policy.autonomy === "intervene" &&
      finding.severity === "critical" &&
      deps.requestCancel &&
      !intervened
    ) {
      intervened = true;
      deps.onEvent(
        createEvent("oversight:intervention", {
          sessionId: deps.sessionId,
          observer: observer.name,
          reason: finding.summary,
        }),
      );
      deps.requestCancel().catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`oversight: cancel request failed: ${msg}`);
      });
    }
  };

  const receive = (event: TelesisDaemonEvent): void => {
    for (const observer of observers) {
      observer.receive(event);
    }
  };

  const drain = async (): Promise<OversightSummary> => {
    // Drain all observers concurrently
    const results = await Promise.all(
      observers.map(async (observer) => {
        try {
          return { observer, output: await observer.drain() };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`oversight: drain failed for ${observer.name}: ${msg}`);
          return null;
        }
      }),
    );

    let totalFindings = 0;
    let totalNotes = 0;

    for (const result of results) {
      if (!result) continue;
      const { observer, output } = result;

      for (const finding of output.findings) {
        totalFindings++;
        emitFinding(observer, finding);
      }

      for (const note of output.notes) {
        totalNotes++;
        deps.onEvent(
          createEvent("oversight:note", {
            sessionId: deps.sessionId,
            text: note.text.slice(0, 120),
            tags: note.tags,
          }),
        );
      }

      if (output.intervention && !intervened) {
        intervened = true;
        deps.onEvent(
          createEvent("oversight:intervention", {
            sessionId: deps.sessionId,
            observer: observer.name,
            reason: output.intervention.reason,
          }),
        );
        if (deps.requestCancel) {
          await deps.requestCancel().catch((cancelErr) => {
            const msg =
              cancelErr instanceof Error
                ? cancelErr.message
                : String(cancelErr);
            console.error(`oversight: cancel request failed: ${msg}`);
          });
        }
      }
    }

    return { findingCount: totalFindings, noteCount: totalNotes, intervened };
  };

  return { receive, drain };
};
