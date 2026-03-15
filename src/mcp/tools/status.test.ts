import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createRootResolver } from "../root-resolver.js";
import { register } from "./status.js";
import { save } from "../../config/config.js";
import type { Config } from "../../config/config.js";
import { useTempDir } from "../../test-utils.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const makeTempDir = useTempDir("mcp-status-test");

const setupProject = (rootDir: string): void => {
  const cfg: Config = {
    project: {
      name: "TestProject",
      owner: "Test Owner",
      language: "TypeScript",
      languages: ["TypeScript"],
      status: "active",
      repo: "",
    },
  };
  save(rootDir, cfg);
  mkdirSync(join(rootDir, "docs", "adr"), { recursive: true });
  mkdirSync(join(rootDir, "docs", "tdd"), { recursive: true });
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

describe("telesis_status tool", () => {
  it("returns project status as JSON", async () => {
    const dir = makeTempDir();
    setupProject(dir);
    const server = createTestServer(dir);
    const client = await connectClient(server);

    const result = await client.callTool({
      name: "telesis_status",
      arguments: {},
    });
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe("text");

    const status = JSON.parse(content[0].text);
    expect(status.projectName).toBe("TestProject");
    expect(status.projectStatus).toBe("active");
    expect(status.adrCount).toBe(0);
    expect(status.tddCount).toBe(0);
  });

  it("counts ADRs when present", async () => {
    const dir = makeTempDir();
    setupProject(dir);
    writeFileSync(
      join(dir, "docs", "adr", "ADR-001-test.md"),
      "# ADR-001: test\n",
    );
    const server = createTestServer(dir);
    const client = await connectClient(server);

    const result = await client.callTool({
      name: "telesis_status",
      arguments: {},
    });
    const content = result.content as Array<{ type: string; text: string }>;
    const status = JSON.parse(content[0].text);
    expect(status.adrCount).toBe(1);
  });

  it("returns error for missing project", async () => {
    const dir = makeTempDir();
    const server = createTestServer(dir);
    const client = await connectClient(server);

    const result = await client.callTool({
      name: "telesis_status",
      arguments: {},
    });
    expect(result.isError).toBe(true);
  });
});
