import { describe, it, expect, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setupOversight } from "./setup.js";
import type { TelesisDaemonEvent } from "../daemon/types.js";
import type { AgentAdapter } from "../dispatch/adapter.js";
import { useTempDir } from "../test-utils.js";

const makeTempDir = useTempDir("oversight-setup");

const setupProject = (
  dir: string,
  policies: readonly { name: string; content: string }[] = [],
): void => {
  mkdirSync(join(dir, ".telesis", "agents"), { recursive: true });
  mkdirSync(join(dir, "docs"), { recursive: true });

  writeFileSync(
    join(dir, ".telesis", "config.yml"),
    "project:\n  name: TestProject\n  owner: test\n  languages:\n  - TypeScript\n  status: active\n  repo: test\n",
  );

  for (const p of policies) {
    writeFileSync(join(dir, ".telesis", "agents", `${p.name}.md`), p.content);
  }
};

const makeAdapter = (): AgentAdapter => ({
  createSession: vi.fn().mockResolvedValue("session"),
  prompt: vi.fn().mockResolvedValue(undefined),
  cancel: vi.fn().mockResolvedValue(undefined),
  closeSession: vi.fn().mockResolvedValue(undefined),
});

describe("setupOversight", () => {
  it("returns null when no enabled policies exist", () => {
    const dir = makeTempDir();
    setupProject(dir);

    const result = setupOversight({
      rootDir: dir,
      sessionId: "s1",
      oversightConfig: {},
      oversightEnabled: true,
      onEvent: vi.fn(),
      adapter: makeAdapter(),
      agent: "claude",
    });

    expect(result).toBeNull();
  });

  it("returns null when oversightEnabled is false", () => {
    const dir = makeTempDir();
    setupProject(dir, [
      {
        name: "reviewer",
        content:
          "---\nname: reviewer\nenabled: true\nautonomy: alert\ntrigger: periodic\nintervalEvents: 5\n---\n\nBody.",
      },
    ]);

    const result = setupOversight({
      rootDir: dir,
      sessionId: "s1",
      oversightConfig: {},
      oversightEnabled: false,
      onEvent: vi.fn() as (event: TelesisDaemonEvent) => void,
      adapter: makeAdapter(),
      agent: "claude",
    });

    expect(result).toBeNull();
  });

  it("returns orchestrator when enabled policies exist", () => {
    const dir = makeTempDir();
    setupProject(dir, [
      {
        name: "reviewer",
        content:
          "---\nname: reviewer\nenabled: true\nautonomy: alert\ntrigger: periodic\nintervalEvents: 5\n---\n\nBody.",
      },
    ]);

    const originalKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";
    try {
      const result = setupOversight({
        rootDir: dir,
        sessionId: "s1",
        oversightConfig: {},
        oversightEnabled: true,
        onEvent: vi.fn() as (event: TelesisDaemonEvent) => void,
        adapter: makeAdapter(),
        agent: "claude",
      });

      expect(result).not.toBeNull();
      expect(result!.orchestrator.receive).toBeInstanceOf(Function);
      expect(result!.orchestrator.drain).toBeInstanceOf(Function);
      expect(result!.onEvent).toBeInstanceOf(Function);
    } finally {
      if (originalKey === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = originalKey;
      }
    }
  });

  it("returns null when ANTHROPIC_API_KEY is missing", () => {
    const dir = makeTempDir();
    setupProject(dir, [
      {
        name: "reviewer",
        content:
          "---\nname: reviewer\nenabled: true\nautonomy: alert\ntrigger: periodic\nintervalEvents: 5\n---\n\nBody.",
      },
    ]);

    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const result = setupOversight({
        rootDir: dir,
        sessionId: "s1",
        oversightConfig: {},
        oversightEnabled: true,
        onEvent: vi.fn() as (event: TelesisDaemonEvent) => void,
        adapter: makeAdapter(),
        agent: "claude",
      });

      expect(result).toBeNull();
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining("ANTHROPIC_API_KEY"),
      );
    } finally {
      if (originalKey !== undefined) {
        process.env.ANTHROPIC_API_KEY = originalKey;
      }
      stderrSpy.mockRestore();
    }
  });
});
