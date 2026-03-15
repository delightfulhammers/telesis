import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createRootResolver } from "../root-resolver.js";
import { register } from "./drift.js";
import { save } from "../../config/config.js";
import type { Config } from "../../config/config.js";
import { useTempDir } from "../../test-utils.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const makeTempDir = useTempDir("mcp-drift-test");

const setupProject = (rootDir: string): void => {
  const cfg: Config = {
    project: {
      name: "TestProject",
      owner: "Test Owner",
      language: "Go",
      languages: ["Go"],
      status: "active",
      repo: "",
    },
  };
  save(rootDir, cfg);
  mkdirSync(join(rootDir, "docs", "adr"), { recursive: true });
  mkdirSync(join(rootDir, "docs", "tdd"), { recursive: true });
  mkdirSync(join(rootDir, "src"), { recursive: true });
};

const createTestServer = (rootDir: string) => {
  const server = new McpServer({ name: "test", version: "0.0.1" });
  const resolver = createRootResolver(rootDir);
  register(server, resolver);
  return server;
};

const connectClient = async (server: McpServer) => {
  const client = new Client({ name: "test-client", version: "0.0.1" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);
  return client;
};

describe("telesis_drift tool", () => {
  it("returns a drift report", async () => {
    const dir = makeTempDir();
    setupProject(dir);
    const server = createTestServer(dir);
    const client = await connectClient(server);

    const result = await client.callTool({
      name: "telesis_drift",
      arguments: {},
    });
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe("text");

    const report = JSON.parse(content[0].text);
    expect(report).toHaveProperty("passed");
    expect(report).toHaveProperty("summary");
    expect(report).toHaveProperty("checks");
    expect(Array.isArray(report.checks)).toBe(true);
  });

  it("returns error for unknown check names", async () => {
    const dir = makeTempDir();
    setupProject(dir);
    const server = createTestServer(dir);
    const client = await connectClient(server);

    const result = await client.callTool({
      name: "telesis_drift",
      arguments: { checks: ["nonexistent-check"] },
    });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("Unknown check");
  });
});
