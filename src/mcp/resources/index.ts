import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RootResolver } from "../root-resolver.js";
import { registerDocResources } from "./docs.js";

export const registerResources = (
  server: McpServer,
  resolveRoot: RootResolver,
): void => {
  registerDocResources(server, resolveRoot);
};
