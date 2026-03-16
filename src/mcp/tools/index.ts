import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RootResolver } from "../root-resolver.js";
import type { ModelClientFactory } from "../types.js";
import { register as registerStatus } from "./status.js";
import { register as registerDrift } from "./drift.js";
import { register as registerContext } from "./context.js";
import { register as registerAdr } from "./adr.js";
import { register as registerTdd } from "./tdd.js";
import { register as registerJournal } from "./journal.js";
import { register as registerNotes } from "./notes.js";
import { register as registerMilestone } from "./milestone.js";
import { register as registerIntake } from "./intake.js";
import { register as registerPlan } from "./plan.js";
import { register as registerDispatch } from "./dispatch.js";
import { register as registerReview } from "./review.js";
import { register as registerOrchestrator } from "./orchestrator.js";

export const registerAllTools = (
  server: McpServer,
  resolveRoot: RootResolver,
  createClient: ModelClientFactory,
): void => {
  registerStatus(server, resolveRoot);
  registerDrift(server, resolveRoot);
  registerContext(server, resolveRoot);
  registerAdr(server, resolveRoot);
  registerTdd(server, resolveRoot);
  registerJournal(server, resolveRoot);
  registerNotes(server, resolveRoot);
  registerMilestone(server, resolveRoot);
  registerIntake(server, resolveRoot);
  registerPlan(server, resolveRoot);
  registerDispatch(server, resolveRoot);
  registerReview(server, resolveRoot, createClient);
  registerOrchestrator(server, resolveRoot, createClient);
};
