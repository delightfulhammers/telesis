#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRootResolver } from "./mcp/root-resolver.js";
import { createServer } from "./mcp/server.js";
import { createModelClient, createSdk } from "./agent/model/client.js";
import { createTelemetryLogger } from "./agent/telemetry/logger.js";
import type { ModelClientFactory } from "./mcp/types.js";

const readVersion = (): string => {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(
      readFileSync(join(dir, "..", "package.json"), "utf-8"),
    );
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
};

const resolveRoot = createRootResolver(process.cwd());
const sdk = createSdk();

const createClient: ModelClientFactory = (rootDir, sessionId, component) => {
  const telemetry = createTelemetryLogger(rootDir);
  return createModelClient({ sdk, telemetry, sessionId, component });
};

const server = createServer(resolveRoot, createClient, readVersion());

const transport = new StdioServerTransport();
await server.connect(transport);
