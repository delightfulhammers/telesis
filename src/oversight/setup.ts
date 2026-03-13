import type { TelesisDaemonEvent } from "../daemon/types.js";
import type { OversightConfig } from "../config/config.js";
import type { AgentAdapter } from "../dispatch/adapter.js";
import type { OversightOrchestrator } from "./types.js";
import { createModelClient, createSdk } from "../agent/model/client.js";
import { createTelemetryLogger } from "../agent/telemetry/logger.js";
import { createOversightOrchestrator } from "./orchestrator.js";

interface SetupOversightDeps {
  readonly rootDir: string;
  readonly sessionId: string;
  readonly oversightConfig: OversightConfig;
  readonly oversightEnabled: boolean;
  readonly onEvent: (event: TelesisDaemonEvent) => void;
  readonly adapter: AgentAdapter;
  readonly agent: string;
}

/** Result of setting up oversight — includes a wrapped onEvent that fans out to the orchestrator */
export interface OversightSetupResult {
  readonly orchestrator: OversightOrchestrator;
  readonly onEvent: (event: TelesisDaemonEvent) => void;
}

/**
 * Create the oversight orchestrator with all its dependencies.
 * Returns null if oversight is disabled, API key is missing, or no enabled policies exist.
 * When non-null, returns both the orchestrator and a wrapped onEvent that fans out
 * events to both the original handler and the orchestrator.
 */
export const setupOversight = (
  deps: SetupOversightDeps,
): OversightSetupResult | null => {
  if (!deps.oversightEnabled || deps.oversightConfig.enabled === false) {
    return null;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("oversight: ANTHROPIC_API_KEY not set — skipping observers");
    return null;
  }

  const telemetry = createTelemetryLogger(deps.rootDir);
  const modelClient = createModelClient({
    sdk: createSdk(),
    telemetry,
    sessionId: deps.sessionId,
    component: "oversight",
    defaultModel: deps.oversightConfig.defaultModel,
  });

  const orchestrator = createOversightOrchestrator({
    rootDir: deps.rootDir,
    sessionId: deps.sessionId,
    modelClient,
    onEvent: deps.onEvent,
    requestCancel: async () => {
      await deps.adapter.cancel(deps.agent, deps.sessionId, deps.rootDir);
    },
  });

  if (!orchestrator) return null;

  // Wrap onEvent to fan out to both the original handler and the orchestrator
  const baseOnEvent = deps.onEvent;
  const onEvent = (event: TelesisDaemonEvent): void => {
    baseOnEvent(event);
    orchestrator.receive(event);
  };

  return { orchestrator, onEvent };
};
