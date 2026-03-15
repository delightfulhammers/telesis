import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RootResolver } from "./root-resolver.js";
import type { ModelClientFactory } from "./types.js";
import { registerAllTools } from "./tools/index.js";
import { registerResources } from "./resources/index.js";

export const createServer = (
  resolveRoot: RootResolver,
  createClient: ModelClientFactory,
  version: string = "0.0.0",
): McpServer => {
  const server = new McpServer({
    name: "telesis",
    version,
  });

  registerAllTools(server, resolveRoot, createClient);
  registerResources(server, resolveRoot);

  return server;
};
