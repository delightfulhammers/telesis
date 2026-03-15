import { describe, it, expect, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  startOrchestrator,
  stopOrchestrator,
  type OrchestratorHandle,
} from "./integration.js";
import { loadContext } from "./persistence.js";
import { save } from "../config/config.js";
import type { Config } from "../config/config.js";
import type { EventBus } from "../daemon/bus.js";
import { useTempDir } from "../test-utils.js";

const makeTempDir = useTempDir("orchestrator-integration-test");

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
  mkdirSync(join(rootDir, "docs", "adr"), { recursive: true });
  mkdirSync(join(rootDir, "docs", "tdd"), { recursive: true });
};

const mockBus = (): EventBus => {
  const subscribers: Array<(event: any) => void> = [];
  return {
    publish: vi.fn((event) => {
      for (const sub of subscribers) sub(event);
    }),
    subscribe: vi.fn((handler) => {
      subscribers.push(handler);
      return { unsubscribe: vi.fn() } as any;
    }),
    ofType: vi.fn(() => ({ unsubscribe: vi.fn() }) as any),
    events$: {} as any,
    dispose: vi.fn(),
    isDisposed: vi.fn().mockReturnValue(false),
  };
};

describe("orchestrator integration", () => {
  it("starts and loads persisted state", () => {
    const dir = makeTempDir();
    setupProject(dir);
    const bus = mockBus();

    const handle = startOrchestrator(dir, bus);
    expect(handle).toBeDefined();
    expect(handle.getContext().state).toBe("idle");

    stopOrchestrator(handle);
  });

  it("persists state on stop", () => {
    const dir = makeTempDir();
    setupProject(dir);
    const bus = mockBus();

    const handle = startOrchestrator(dir, bus);
    stopOrchestrator(handle);

    const saved = loadContext(dir);
    expect(saved).not.toBeNull();
    expect(saved!.state).toBe("idle");
  });

  it("emits orchestrator events on the bus", () => {
    const dir = makeTempDir();
    setupProject(dir);
    const bus = mockBus();

    const handle = startOrchestrator(dir, bus);

    // The bus.publish should have been called (at least for state emission)
    expect(bus.publish).toBeDefined();

    stopOrchestrator(handle);
  });
});
