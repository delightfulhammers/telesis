import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createRootResolver } from "../root-resolver.js";
import { registerDocResources } from "./docs.js";
import { save } from "../../config/config.js";
import type { Config } from "../../config/config.js";
import { useTempDir } from "../../test-utils.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const makeTempDir = useTempDir("mcp-docs-test");

const setupProject = (rootDir: string): void => {
  const cfg: Config = {
    project: {
      name: "TestProject",
      owner: "Test",
      language: "TypeScript",
      languages: ["TypeScript"],
      status: "active",
      repo: "",
    },
  };
  save(rootDir, cfg);
  mkdirSync(join(rootDir, "docs"), { recursive: true });
};

const createTestServer = (rootDir: string) => {
  const server = new McpServer({ name: "test", version: "0.0.1" });
  const resolver = createRootResolver(rootDir);
  registerDocResources(server, resolver);
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

describe("MCP resources", () => {
  it("reads CLAUDE.md resource", async () => {
    const dir = makeTempDir();
    setupProject(dir);
    writeFileSync(join(dir, "CLAUDE.md"), "# Test Context\nSome content.");

    const server = createTestServer(dir);
    const client = await connectClient(server);

    const result = await client.readResource({ uri: "telesis://CLAUDE.md" });
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].text).toContain("Test Context");
  });

  it("reads MILESTONES.md resource", async () => {
    const dir = makeTempDir();
    setupProject(dir);
    writeFileSync(
      join(dir, "docs", "MILESTONES.md"),
      "# Milestones\n\n## v0.1.0\n",
    );

    const server = createTestServer(dir);
    const client = await connectClient(server);

    const result = await client.readResource({
      uri: "telesis://docs/MILESTONES.md",
    });
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].text).toContain("v0.1.0");
  });

  it("reads config resource as YAML", async () => {
    const dir = makeTempDir();
    setupProject(dir);

    const server = createTestServer(dir);
    const client = await connectClient(server);

    const result = await client.readResource({ uri: "telesis://config" });
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].text).toContain("TestProject");
  });

  it("lists available resources", async () => {
    const dir = makeTempDir();
    setupProject(dir);

    const server = createTestServer(dir);
    const client = await connectClient(server);

    const result = await client.listResources();
    const uris = result.resources.map((r) => r.uri);
    expect(uris).toContain("telesis://docs/VISION.md");
    expect(uris).toContain("telesis://docs/MILESTONES.md");
    expect(uris).toContain("telesis://CLAUDE.md");
    expect(uris).toContain("telesis://config");
  });
});
