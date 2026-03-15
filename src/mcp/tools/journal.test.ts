import { describe, it, expect } from "vitest";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createRootResolver } from "../root-resolver.js";
import { register } from "./journal.js";
import { save } from "../../config/config.js";
import type { Config } from "../../config/config.js";
import { useTempDir } from "../../test-utils.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const makeTempDir = useTempDir("mcp-journal-test");

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

describe("journal tools", () => {
  it("adds and lists journal entries", async () => {
    const dir = makeTempDir();
    setupProject(dir);
    const server = createTestServer(dir);
    const client = await connectClient(server);

    // Add an entry
    const addResult = await client.callTool({
      name: "telesis_journal_add",
      arguments: { title: "Test Entry", body: "Some content" },
    });
    const addContent = addResult.content as Array<{
      type: string;
      text: string;
    }>;
    const entry = JSON.parse(addContent[0].text);
    expect(entry.title).toBe("Test Entry");
    expect(entry.body).toBe("Some content");
    expect(entry.id).toBeDefined();

    // List entries
    const listResult = await client.callTool({
      name: "telesis_journal_list",
      arguments: {},
    });
    const listContent = listResult.content as Array<{
      type: string;
      text: string;
    }>;
    const entries = JSON.parse(listContent[0].text);
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe("Test Entry");
  });

  it("shows a journal entry by ID", async () => {
    const dir = makeTempDir();
    setupProject(dir);
    const server = createTestServer(dir);
    const client = await connectClient(server);

    // Add an entry
    const addResult = await client.callTool({
      name: "telesis_journal_add",
      arguments: { title: "Lookup Test", body: "Body text" },
    });
    const addContent = addResult.content as Array<{
      type: string;
      text: string;
    }>;
    const entry = JSON.parse(addContent[0].text);

    // Show by ID
    const showResult = await client.callTool({
      name: "telesis_journal_show",
      arguments: { query: entry.id },
    });
    const showContent = showResult.content as Array<{
      type: string;
      text: string;
    }>;
    const shown = JSON.parse(showContent[0].text);
    expect(shown.title).toBe("Lookup Test");
  });

  it("returns error for missing entry", async () => {
    const dir = makeTempDir();
    setupProject(dir);
    const server = createTestServer(dir);
    const client = await connectClient(server);

    const result = await client.callTool({
      name: "telesis_journal_show",
      arguments: { query: "nonexistent" },
    });
    expect(result.isError).toBe(true);
  });
});
