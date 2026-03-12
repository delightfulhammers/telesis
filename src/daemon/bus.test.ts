import { describe, it, expect, vi } from "vitest";
import { createBus } from "./bus.js";
import { createEvent } from "./types.js";
import type { TelesisDaemonEvent } from "./types.js";

describe("createBus", () => {
  it("delivers published events to subscribers", () => {
    const bus = createBus();
    const received: TelesisDaemonEvent[] = [];

    bus.subscribe((e) => received.push(e));

    const event = createEvent("daemon:heartbeat", {
      uptimeMs: 1000,
      eventCount: 5,
    });
    bus.publish(event);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(event);
    bus.dispose();
  });

  it("delivers to multiple subscribers", () => {
    const bus = createBus();
    const a: TelesisDaemonEvent[] = [];
    const b: TelesisDaemonEvent[] = [];

    bus.subscribe((e) => a.push(e));
    bus.subscribe((e) => b.push(e));

    bus.publish(createEvent("daemon:stopping", {} as Record<string, never>));

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    bus.dispose();
  });

  it("ofType filters to the specified event type", () => {
    const bus = createBus();
    const heartbeats: TelesisDaemonEvent[] = [];

    bus.ofType("daemon:heartbeat", (e) => heartbeats.push(e));

    bus.publish(
      createEvent("daemon:started", {
        pid: 1,
        rootDir: "/tmp",
        version: "0.12.0",
      }),
    );
    bus.publish(
      createEvent("daemon:heartbeat", { uptimeMs: 100, eventCount: 1 }),
    );
    bus.publish(
      createEvent("daemon:heartbeat", { uptimeMs: 200, eventCount: 2 }),
    );

    expect(heartbeats).toHaveLength(2);
    expect(heartbeats[0].type).toBe("daemon:heartbeat");
    bus.dispose();
  });

  it("unsubscribed handlers stop receiving events", () => {
    const bus = createBus();
    const received: TelesisDaemonEvent[] = [];

    const sub = bus.subscribe((e) => received.push(e));
    bus.publish(
      createEvent("daemon:heartbeat", { uptimeMs: 100, eventCount: 1 }),
    );
    sub.unsubscribe();
    bus.publish(
      createEvent("daemon:heartbeat", { uptimeMs: 200, eventCount: 2 }),
    );

    expect(received).toHaveLength(1);
    bus.dispose();
  });

  it("dispose completes the subject and stops delivery", () => {
    const bus = createBus();
    const complete = vi.fn();
    const received: TelesisDaemonEvent[] = [];

    bus.events$.subscribe({ next: (e) => received.push(e), complete });
    bus.dispose();

    expect(complete).toHaveBeenCalledOnce();
    expect(bus.isDisposed()).toBe(true);

    // Publishing after dispose is a no-op
    bus.publish(
      createEvent("daemon:heartbeat", { uptimeMs: 100, eventCount: 1 }),
    );
    expect(received).toHaveLength(0);
  });

  it("double dispose is safe", () => {
    const bus = createBus();
    bus.dispose();
    bus.dispose();
    expect(bus.isDisposed()).toBe(true);
  });
});
