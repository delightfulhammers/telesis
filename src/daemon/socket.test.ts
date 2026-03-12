import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createConnection } from "node:net";
import { randomUUID } from "node:crypto";
import { useTempDir } from "../test-utils.js";
import { startSocketServer, type DaemonSocketServer } from "./socket.js";
import { createBus, type EventBus } from "./bus.js";
import { createEvent } from "./types.js";

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Send an NDJSON command and read the response */
const sendCommand = (
  socketPath: string,
  command: string,
): Promise<Record<string, unknown>> =>
  new Promise((resolve, reject) => {
    const id = randomUUID();
    const socket = createConnection(socketPath);
    let buffer = "";

    socket.on("connect", () => {
      socket.write(JSON.stringify({ id, command }) + "\n");
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf-8");
      const newlineIdx = buffer.indexOf("\n");
      if (newlineIdx !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        socket.destroy();
        try {
          resolve(JSON.parse(line));
        } catch (err) {
          reject(err);
        }
      }
    });

    socket.on("error", reject);
    setTimeout(() => {
      socket.destroy();
      reject(new Error("timeout"));
    }, 3000);
  });

describe("startSocketServer", () => {
  const makeTempDir = useTempDir("socket");
  let server: DaemonSocketServer | null = null;
  let bus: EventBus | null = null;

  afterEach(async () => {
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
    let stopCalled = false;
    server = await startSocketServer(
      dir,
      bus,
      () => ({
        pid: process.pid,
        uptimeMs: 1000,
        eventCount: 42,
        clientCount: server!.clientCount(),
      }),
      () => {
        stopCalled = true;
      },
    );
    // Wire bus events to socket broadcast (mirrors entrypoint.ts wiring)
    bus.subscribe((event) => server!.broadcast(event));
    return { bus: bus!, server: server!, getStopCalled: () => stopCalled };
  };

  it("responds to ping", async () => {
    const dir = makeTempDir();
    await setup(dir);

    const sockPath = join(dir, ".telesis", "daemon.sock");
    const response = await sendCommand(sockPath, "ping");

    expect(response.ok).toBe(true);
    expect(response.data).toBe("pong");
  });

  it("responds to status", async () => {
    const dir = makeTempDir();
    await setup(dir);

    const sockPath = join(dir, ".telesis", "daemon.sock");
    const response = await sendCommand(sockPath, "status");

    expect(response.ok).toBe(true);
    const data = response.data as Record<string, unknown>;
    expect(data.pid).toBe(process.pid);
    expect(data.uptimeMs).toBe(1000);
    expect(data.eventCount).toBe(42);
  });

  it("broadcasts events to subscribed clients", async () => {
    const dir = makeTempDir();
    const { bus: b, server: s } = await setup(dir);

    const sockPath = join(dir, ".telesis", "daemon.sock");

    // Connect and subscribe
    const received: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const socket = createConnection(sockPath);
      const subId = randomUUID();

      socket.on("connect", () => {
        socket.write(
          JSON.stringify({ id: subId, command: "subscribe" }) + "\n",
        );
      });

      let buffer = "";
      socket.on("data", (chunk) => {
        buffer += chunk.toString("utf-8");
        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIdx).trim();
          buffer = buffer.slice(newlineIdx + 1);
          if (line.length > 0) {
            const msg = JSON.parse(line);
            if (msg.id === subId && msg.ok) {
              // Subscribed — now emit an event
              b.publish(
                createEvent("daemon:heartbeat", {
                  uptimeMs: 500,
                  eventCount: 10,
                }),
              );
            } else if (msg.broadcast) {
              received.push(msg.event.type);
              socket.destroy();
              resolve();
            }
          }
        }
      });

      socket.on("error", reject);
      setTimeout(() => {
        socket.destroy();
        reject(new Error("timeout"));
      }, 3000);
    });

    expect(received).toContain("daemon:heartbeat");
  });

  it("returns error for unknown command", async () => {
    const dir = makeTempDir();
    await setup(dir);

    const sockPath = join(dir, ".telesis", "daemon.sock");
    const response = await sendCommand(sockPath, "bogus");

    expect(response.ok).toBe(false);
    expect(response.error).toContain("unknown command");
  });

  it("tracks client count", async () => {
    const dir = makeTempDir();
    const { server: s } = await setup(dir);

    expect(s.clientCount()).toBe(0);

    const sockPath = join(dir, ".telesis", "daemon.sock");
    const socket = createConnection(sockPath);

    await new Promise<void>((resolve) => {
      socket.on("connect", resolve);
    });
    await wait(50);

    expect(s.clientCount()).toBe(1);
    socket.destroy();
    await wait(50);
    expect(s.clientCount()).toBe(0);
  });
});
