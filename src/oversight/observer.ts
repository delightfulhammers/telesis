import type { TelesisDaemonEvent } from "../daemon/types.js";
import type { DispatchContext } from "../dispatch/context.js";
import type {
  AnalyzeFn,
  Observer,
  ObserverOutput,
  PolicyFile,
} from "./types.js";

const EMPTY_OUTPUT: ObserverOutput = {
  findings: [],
  notes: [],
};

/** Merge multiple ObserverOutputs into one */
const mergeOutputs = (outputs: readonly ObserverOutput[]): ObserverOutput => {
  const findings = outputs.flatMap((o) => o.findings);
  const notes = outputs.flatMap((o) => o.notes);
  const intervention = outputs.find((o) => o.intervention)?.intervention;
  return { findings, notes, intervention };
};

interface CreateObserverDeps {
  readonly policy: PolicyFile;
  readonly analyzeFn: AnalyzeFn;
  readonly context: DispatchContext;
}

/**
 * Creates a generic observer that buffers events and triggers analysis
 * based on the policy's trigger mode.
 *
 * - `periodic`: fires analysis every `intervalEvents` events
 * - `on-output`: fires analysis on each `dispatch:agent:output` event
 * - `on-complete`: analysis runs only in `drain()`
 *
 * `receive()` is always synchronous. Analysis runs as background promises.
 * `drain()` runs a final analysis on the full buffer and awaits all pending.
 */
export const createObserver = (deps: CreateObserverDeps): Observer => {
  const { policy, analyzeFn, context } = deps;

  const buffer: TelesisDaemonEvent[] = [];
  const pending: Promise<ObserverOutput>[] = [];
  let eventsSinceAnalysis = 0;

  const scheduleAnalysis = (): void => {
    const snapshot = [...buffer];
    const promise = analyzeFn(snapshot, context).catch(
      (err): ObserverOutput => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`oversight: ${policy.name} analysis failed: ${msg}`);
        return EMPTY_OUTPUT;
      },
    );
    pending.push(promise);
    eventsSinceAnalysis = 0;
  };

  const receive = (event: TelesisDaemonEvent): void => {
    buffer.push(event);
    eventsSinceAnalysis++;

    if (policy.trigger === "periodic") {
      if (eventsSinceAnalysis >= policy.intervalEvents) {
        scheduleAnalysis();
      }
    } else if (policy.trigger === "on-output") {
      if (event.type === "dispatch:agent:output") {
        scheduleAnalysis();
      }
    }
    // on-complete: no analysis until drain()
  };

  const drain = async (): Promise<ObserverOutput> => {
    // Run final analysis only if there are unanalyzed events since last trigger
    if (buffer.length > 0 && eventsSinceAnalysis > 0) {
      scheduleAnalysis();
    }

    const results = await Promise.all(pending);
    return mergeOutputs(results);
  };

  return {
    name: policy.name,
    policy,
    receive,
    drain,
  };
};
