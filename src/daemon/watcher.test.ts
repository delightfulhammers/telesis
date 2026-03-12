import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../test-utils.js";
import { startWatcher } from "./watcher.js";
import { createBus } from "./bus.js";
import type { TelesisDaemonEvent } from "./types.js";

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Wait for fs.watch to initialize, then wait for events + debounce */
const INIT_DELAY = 150;
const EVENT_DELAY = 300;

describe("startWatcher", () => {
  const makeTempDir = useTempDir("watcher");

  it("emits fs:file:created when a file is created", async () => {
    const dir = makeTempDir();
    const bus = createBus();
    const events: TelesisDaemonEvent[] = [];
    bus.subscribe((e) => events.push(e));

    const handle = startWatcher(dir, bus, []);
    try {
      await wait(INIT_DELAY);
      writeFileSync(join(dir, "test.txt"), "hello");
      await wait(EVENT_DELAY);

      const fsEvents = events.filter((e) => e.type.startsWith("fs:"));
      expect(fsEvents.length).toBeGreaterThanOrEqual(1);
      expect(fsEvents[0].type).toBe("fs:file:created");
      expect(fsEvents[0].payload).toHaveProperty("path", "test.txt");
    } finally {
      handle.close();
      bus.dispose();
    }
  });

  it("emits a file event when a file is changed", async () => {
    const dir = makeTempDir();
    // Create file before starting watcher
    writeFileSync(join(dir, "existing.txt"), "initial");

    const bus = createBus();
    const events: TelesisDaemonEvent[] = [];
    bus.subscribe((e) => events.push(e));

    const handle = startWatcher(dir, bus, []);
    try {
      await wait(INIT_DELAY);
      writeFileSync(join(dir, "existing.txt"), "modified");
      await wait(EVENT_DELAY);

      // On macOS, writeFileSync can report as "rename" (atomic write) or "change"
      const fileEvents = events.filter(
        (e) =>
          e.type.startsWith("fs:file:") && e.payload.path === "existing.txt",
      );
      expect(fileEvents.length).toBeGreaterThanOrEqual(1);
    } finally {
      handle.close();
      bus.dispose();
    }
  });

  it("emits fs:file:deleted when a file is removed", async () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "doomed.txt"), "bye");

    const bus = createBus();
    const events: TelesisDaemonEvent[] = [];
    bus.subscribe((e) => events.push(e));

    const handle = startWatcher(dir, bus, []);
    try {
      await wait(INIT_DELAY);
      unlinkSync(join(dir, "doomed.txt"));
      await wait(EVENT_DELAY);

      const deleted = events.filter((e) => e.type === "fs:file:deleted");
      expect(deleted.length).toBeGreaterThanOrEqual(1);
      expect(deleted[0].payload).toHaveProperty("path", "doomed.txt");
    } finally {
      handle.close();
      bus.dispose();
    }
  });

  it("ignores files matching ignore patterns", async () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "node_modules"), { recursive: true });

    const bus = createBus();
    const events: TelesisDaemonEvent[] = [];
    bus.subscribe((e) => events.push(e));

    const handle = startWatcher(dir, bus, ["node_modules/"]);
    try {
      await wait(INIT_DELAY);
      writeFileSync(join(dir, "node_modules", "pkg.json"), "{}");
      await wait(EVENT_DELAY);

      const fsEvents = events.filter((e) => e.type.startsWith("fs:"));
      expect(fsEvents).toHaveLength(0);
    } finally {
      handle.close();
      bus.dispose();
    }
  });

  it("debounces rapid changes to the same file", async () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "rapid.txt"), "v0");

    const bus = createBus();
    const events: TelesisDaemonEvent[] = [];
    bus.subscribe((e) => events.push(e));

    const handle = startWatcher(dir, bus, []);
    try {
      await wait(INIT_DELAY);
      // Rapid writes within debounce window
      writeFileSync(join(dir, "rapid.txt"), "v1");
      writeFileSync(join(dir, "rapid.txt"), "v2");
      writeFileSync(join(dir, "rapid.txt"), "v3");
      await wait(EVENT_DELAY);

      const modified = events.filter(
        (e) => e.type === "fs:file:modified" && e.payload.path === "rapid.txt",
      );
      // Debounce should collapse to 1-2 events
      expect(modified.length).toBeLessThanOrEqual(2);
    } finally {
      handle.close();
      bus.dispose();
    }
  });

  it("close stops emitting events", async () => {
    const dir = makeTempDir();
    const bus = createBus();
    const events: TelesisDaemonEvent[] = [];
    bus.subscribe((e) => events.push(e));

    const handle = startWatcher(dir, bus, []);
    handle.close();

    writeFileSync(join(dir, "after-close.txt"), "should not emit");
    await wait(EVENT_DELAY);

    const fsEvents = events.filter((e) => e.type.startsWith("fs:"));
    expect(fsEvents).toHaveLength(0);
    bus.dispose();
  });
});
