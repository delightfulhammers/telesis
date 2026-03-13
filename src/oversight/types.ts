import type { TelesisDaemonEvent } from "../daemon/types.js";
import type { DispatchContext } from "../dispatch/context.js";
import type { ModelClient } from "../agent/model/client.js";

/** How much authority an observer has */
export type AutonomyLevel = "observe" | "alert" | "intervene";

/** When the observer triggers analysis */
export type TriggerMode = "periodic" | "on-output" | "on-complete";

/** Parsed policy file from .telesis/agents/<name>.md */
export interface PolicyFile {
  readonly name: string;
  readonly version: number;
  readonly enabled: boolean;
  readonly autonomy: AutonomyLevel;
  readonly trigger: TriggerMode;
  readonly intervalEvents: number;
  readonly model: string;
  readonly systemPrompt: string;
}

/** A finding produced by a reviewer or architect observer */
export interface OversightFinding {
  readonly id: string;
  readonly observer: string;
  readonly sessionId: string;
  readonly severity: "info" | "warning" | "critical";
  readonly summary: string;
  readonly detail: string;
  readonly eventRange: { readonly from: number; readonly to: number };
}

/** A note produced by the chronicler */
export interface ChroniclerNote {
  readonly text: string;
  readonly tags: readonly string[];
}

/** Aggregated output from a single observer analysis pass */
export interface ObserverOutput {
  readonly findings: readonly OversightFinding[];
  readonly notes: readonly ChroniclerNote[];
  readonly intervention?: { readonly reason: string };
}

/** Analysis function signature — called with buffered events and project context */
export type AnalyzeFn = (
  events: readonly TelesisDaemonEvent[],
  context: DispatchContext,
) => Promise<ObserverOutput>;

/** A single observer instance with synchronous receive and async drain */
export interface Observer {
  readonly name: string;
  readonly policy: PolicyFile;
  readonly receive: (event: TelesisDaemonEvent) => void;
  readonly drain: () => Promise<ObserverOutput>;
}

/** Summary returned by the orchestrator after draining all observers */
export interface OversightSummary {
  readonly findingCount: number;
  readonly noteCount: number;
  readonly intervened: boolean;
}

/** Dependencies injected into the oversight orchestrator */
export interface OversightDeps {
  readonly rootDir: string;
  readonly sessionId: string;
  readonly modelClient: ModelClient;
  readonly onEvent: (event: TelesisDaemonEvent) => void;
  readonly requestCancel?: () => Promise<void>;
}

/** The orchestrator interface returned by createOversightOrchestrator */
export interface OversightOrchestrator {
  readonly receive: (event: TelesisDaemonEvent) => void;
  readonly drain: () => Promise<OversightSummary>;
}
