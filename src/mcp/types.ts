import type { ModelClient } from "../agent/model/client.js";

/**
 * Factory that creates a session-scoped ModelClient.
 * Injected at server startup so tool handlers don't construct SDK instances.
 */
export type ModelClientFactory = (
  rootDir: string,
  sessionId: string,
  component: string,
) => ModelClient;
