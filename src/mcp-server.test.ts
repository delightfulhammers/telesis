import { describe, it, expect } from "vitest";
import { createRootResolver } from "./mcp/root-resolver.js";
import { createServer } from "./mcp/server.js";

describe("mcp-server composition", () => {
  it("composes a server from root resolver, client factory, and server factory", () => {
    const resolver = createRootResolver("/tmp");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stub for test
    const noopClientFactory = () => ({}) as any;
    const server = createServer(resolver, noopClientFactory);
    expect(server).toBeDefined();
  });
});
