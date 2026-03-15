import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "./server.js";
import { createRootResolver } from "./root-resolver.js";
import { useTempDir } from "../test-utils.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const makeTempDir = useTempDir("server-test");

const setupProject = (rootDir: string): void => {
  mkdirSync(join(rootDir, ".telesis"), { recursive: true });
  mkdirSync(join(rootDir, "docs", "adr"), { recursive: true });
  mkdirSync(join(rootDir, "docs", "tdd"), { recursive: true });
  writeFileSync(
    join(rootDir, ".telesis", "config.yml"),
    "project:\n  name: TestProject\n  owner: Test\n  languages:\n    - TypeScript\n  status: active\n  repo: ''\n",
  );
};

describe("createServer", () => {
  it("creates an MCP server that can list tools", async () => {
    const dir = makeTempDir();
    setupProject(dir);
    const resolver = createRootResolver(dir);
    const noopClientFactory = () => ({}) as any;
    const server = createServer(resolver, noopClientFactory);

    const client = new Client({ name: "test-client", version: "0.0.1" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);

    const tools = await client.listTools();
    const toolNames = tools.tools.map((t) => t.name);

    expect(toolNames).toContain("telesis_status");
    expect(toolNames).toContain("telesis_drift");
    expect(toolNames).toContain("telesis_context_generate");
    expect(toolNames).toContain("telesis_adr_new");
    expect(toolNames).toContain("telesis_review");
    expect(toolNames).toContain("telesis_journal_add");
    expect(toolNames).toContain("telesis_note_add");
    expect(toolNames).toContain("telesis_milestone_check");
  });

  it("exposes resources", async () => {
    const dir = makeTempDir();
    setupProject(dir);
    const resolver = createRootResolver(dir);
    const noopClientFactory = () => ({}) as any;
    const server = createServer(resolver, noopClientFactory);

    const client = new Client({ name: "test-client", version: "0.0.1" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);

    const resources = await client.listResources();
    const uris = resources.resources.map((r) => r.uri);
    expect(uris).toContain("telesis://config");
    expect(uris).toContain("telesis://CLAUDE.md");
  });
});
