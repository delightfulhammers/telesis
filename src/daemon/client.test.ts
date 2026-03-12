import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../test-utils.js";
import { startSocketServer, type DaemonSocketServer } from "./socket.js";
import { createBus, type EventBus } from "./bus.js";
import { connect, type DaemonClient } from "./client.js";
import { createEvent } from "./types.js";

describe("DaemonClient", () => {
  const makeTempDir = useTempDir("client");
  let server: DaemonSocketServer | null = null;
  let bus: EventBus | null = null;
  let client: DaemonClient | null = null;

  afterEach(async () => {
    if (client) {
      client.disconnect();
      client = null;
    }
    if (server) {
      await server.close();
      server = null;
    }
    if (bus) {
      bus.dispose();
      bus = null;
    }
  });

  const setup = async (dir: string) => {
    mkdirSync(join(dir, ".telesis"), { recursive: true });
    bus = createBus();
    server = await startSocketServer(
      dir,
      bus,
      () => ({
        pid: process.pid,
        uptimeMs: 2000,
        eventCount: 99,
        clientCount: server!.clientCount(),
      }),
      () => {},
    );
    // Wire bus events to socket broadcast (mirrors entrypoint.ts wiring)
    bus.subscribe((event) => server!.broadcast(event));
    client = await connect(dir);
    return { bus: bus!, server: server!, client: client! };
  };

  it("sends ping and receives pong", async () => {
    const dir = makeTempDir();
    const { client: c } = await setup(dir);

    const response = await c.sendCommand("ping");
    expect(response.ok).toBe(true);
    expect(response.data).toBe("pong");
  });

  it("sends status and receives daemon info", async () => {
    const dir = makeTempDir();
    const { client: c } = await setup(dir);

    const response = await c.sendCommand("status");
    expect(response.ok).toBe(true);
    const data = response.data as Record<string, unknown>;
    expect(data.pid).toBe(process.pid);
    expect(data.eventCount).toBe(99);
  });

  it("receives broadcast events after subscribing", async () => {
    const dir = makeTempDir();
    const { client: c, bus: b } = await setup(dir);

    const events: string[] = [];
    c.onEvent((event) => events.push(event.type));

    const subResponse = await c.sendCommand("subscribe");
    expect(subResponse.ok).toBe(true);

    b.publish(
      createEvent("daemon:heartbeat", { uptimeMs: 100, eventCount: 1 }),
    );

    // Wait for broadcast to arrive
    await new Promise((r) => setTimeout(r, 100));

    expect(events).toContain("daemon:heartbeat");
  });

  it("disconnect stops receiving events", async () => {
    const dir = makeTempDir();
    const { client: c } = await setup(dir);

    expect(c.isConnected()).toBe(true);
    c.disconnect();
    expect(c.isConnected()).toBe(false);
  });

  it("fails to connect when no daemon is running", async () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".telesis"), { recursive: true });

    await expect(connect(dir)).rejects.toThrow("could not connect to daemon");
  });
});
