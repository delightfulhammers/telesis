import type { EventBus } from "../daemon/bus.js";
import { createContext } from "./machine.js";
import { saveContext, loadContext } from "./persistence.js";
import { advance } from "./runner.js";
import { createSessionReactor } from "../daemon/session-reactor.js";
import type { OrchestratorContext } from "./types.js";
import type { RunnerDeps } from "./runner.js";
import type { SessionLifecycleConfig } from "../config/config.js";

/** Handle returned by startOrchestrator for lifecycle management */
export interface OrchestratorHandle {
  /** Get current orchestrator context (read-only snapshot) */
  readonly getContext: () => OrchestratorContext;
  /** Internal — used by stopOrchestrator */
  readonly _unsubscribe: () => void;
  readonly _rootDir: string;
}

/** Dependencies injected by the daemon entrypoint (composition root) */
export interface OrchestratorStartDeps {
  readonly sessionLifecycle?: SessionLifecycleConfig;
  readonly buildRunnerDeps: () => RunnerDeps;
  readonly notify: (title: string, body: string) => void;
}

/**
 * Starts the orchestrator within the daemon process.
 *
 * - Loads persisted state (or creates fresh)
 * - Subscribes to the event bus via session reactor
 * - Saves state on creation
 *
 * The orchestrator does NOT auto-advance on startup — the daemon
 * or an external trigger calls advance() when appropriate.
 * The session reactor listens for dispatch lifecycle events and
 * drives the orchestrator forward based on restart policy.
 */
export const startOrchestrator = (
  rootDir: string,
  bus: EventBus,
  deps?: OrchestratorStartDeps,
): OrchestratorHandle => {
  // Load persisted state or create fresh
  const ctx = loadContext(rootDir) ?? createContext();

  // Persist initial state
  saveContext(rootDir, ctx);

  // Create session reactor — reacts to dispatch:session:completed/failed
  const reactor = createSessionReactor({
    config: deps?.sessionLifecycle ?? {},
    loadContext: () => loadContext(rootDir),
    saveContext: (c) => saveContext(rootDir, c),
    advance: (c, runnerDeps) => advance(c, runnerDeps),
    buildRunnerDeps:
      deps?.buildRunnerDeps ??
      (() => {
        throw new Error(
          "buildRunnerDeps not provided — session reactor requires daemon context",
        );
      }),
    notify: deps?.notify ?? (() => {}),
  });

  const subscription = bus.subscribe(reactor);

  return {
    getContext: () => loadContext(rootDir) ?? ctx,
    _unsubscribe: () => subscription.unsubscribe(),
    _rootDir: rootDir,
  };
};

/**
 * Stops the orchestrator — unsubscribes from bus and persists final state.
 */
export const stopOrchestrator = (handle: OrchestratorHandle): void => {
  handle._unsubscribe();
  saveContext(handle._rootDir, handle.getContext());
};
