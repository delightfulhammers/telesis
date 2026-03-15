import type { EventBus } from "../daemon/bus.js";
import { createContext } from "./machine.js";
import { saveContext, loadContext } from "./persistence.js";
import type { OrchestratorContext, OrchestratorState } from "./types.js";
import { createEvent } from "../daemon/types.js";

/** Handle returned by startOrchestrator for lifecycle management */
export interface OrchestratorHandle {
  /** Get current orchestrator context (read-only snapshot) */
  readonly getContext: () => OrchestratorContext;
  /** Internal — used by stopOrchestrator */
  readonly _unsubscribe: () => void;
  readonly _rootDir: string;
}

/**
 * Starts the orchestrator within the daemon process.
 *
 * - Loads persisted state (or creates fresh)
 * - Subscribes to the event bus
 * - Saves state on creation
 *
 * The orchestrator does NOT auto-advance on startup — the daemon
 * or an external trigger calls advance() when appropriate.
 */
export const startOrchestrator = (
  rootDir: string,
  bus: EventBus,
): OrchestratorHandle => {
  // Load persisted state or create fresh
  let ctx = loadContext(rootDir) ?? createContext();

  // Persist initial state
  saveContext(rootDir, ctx);

  // Subscribe to bus for event-driven state updates
  const subscription = bus.subscribe((event) => {
    // Future: react to dispatch:session:completed, intake:sync:completed, etc.
    // For now, the orchestrator is advance()-driven, not event-driven.
    // This subscription is the hook point for Phase 9+ reactive behavior.
  });

  return {
    getContext: () => ctx,
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
