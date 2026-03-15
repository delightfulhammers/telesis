import { describe, it, expect } from "vitest";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createRootResolver } from "../root-resolver.js";
import { register } from "./notes.js";
import { save } from "../../config/config.js";
import type { Config } from "../../config/config.js";
import { useTempDir } from "../../test-utils.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const makeTempDir = useTempDir("mcp-notes-test");

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

describe("notes tools", () => {
  it("adds and lists notes with tags", async () => {
    const dir = makeTempDir();
    setupProject(dir);
    const server = createTestServer(dir);
    const client = await connectClient(server);

    // Add a note
    const addResult = await client.callTool({
      name: "telesis_note_add",
      arguments: { text: "Fix the auth bug", tags: ["bug", "auth"] },
    });
    const addContent = addResult.content as Array<{
      type: string;
      text: string;
    }>;
    const note = JSON.parse(addContent[0].text);
    expect(note.text).toBe("Fix the auth bug");
    expect(note.tags).toEqual(["bug", "auth"]);

    // List all notes
    const listResult = await client.callTool({
      name: "telesis_note_list",
      arguments: {},
    });
    const listContent = listResult.content as Array<{
      type: string;
      text: string;
    }>;
    const notes = JSON.parse(listContent[0].text);
    expect(notes).toHaveLength(1);
  });

  it("filters notes by tag", async () => {
    const dir = makeTempDir();
    setupProject(dir);
    const server = createTestServer(dir);
    const client = await connectClient(server);

    await client.callTool({
      name: "telesis_note_add",
      arguments: { text: "Bug note", tags: ["bug"] },
    });
    await client.callTool({
      name: "telesis_note_add",
      arguments: { text: "Feature note", tags: ["feature"] },
    });

    const result = await client.callTool({
      name: "telesis_note_list",
      arguments: { tag: "bug" },
    });
    const content = result.content as Array<{ type: string; text: string }>;
    const notes = JSON.parse(content[0].text);
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toBe("Bug note");
  });
});
