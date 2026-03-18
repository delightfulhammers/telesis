#!/usr/bin/env bun
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRootResolver } from "./mcp/root-resolver.js";
import { createServer } from "./mcp/server.js";
import { createModelClient, createSdk } from "./agent/model/client.js";
import { createTelemetryLogger } from "./agent/telemetry/logger.js";
import type { ModelClientFactory } from "./mcp/types.js";
import { VERSION } from "./version.js";

const resolveRoot = createRootResolver(process.cwd());
const sdk = createSdk();

const createClient: ModelClientFactory = (rootDir, sessionId, component) => {
  const telemetry = createTelemetryLogger(rootDir);
  return createModelClient({ sdk, telemetry, sessionId, component });
};

const server = createServer(resolveRoot, createClient, VERSION);

const transport = new StdioServerTransport();
await server.connect(transport);
