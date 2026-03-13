import { describe, it, expect } from "vitest";
import {
  createAcpxAdapter,
  type SpawnFn,
  type SpawnResult,
} from "./acpx-adapter.js";
import type { AgentEvent } from "./types.js";

const makeReadableStream = (text: string): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
};

const makeMockProc = (
  stdout: string,
  exitCode: number,
  stderr = "",
): SpawnResult => ({
  stdout: makeReadableStream(stdout),
  stderr: makeReadableStream(stderr),
  exited: Promise.resolve(exitCode),
});

/** Build a spawn mock that returns version on first call and custom result after */
const makeSpawn = (
  resultFn: (cmd: readonly string[]) => SpawnResult,
): { spawn: SpawnFn; calls: readonly string[][] } => {
  const calls: string[][] = [];
  const spawn: SpawnFn = (cmd) => {
    calls.push([...cmd]);
    return resultFn(cmd);
  };
  return { spawn, calls };
};

/** Convenience: spawn that succeeds on --version and delegates to fn for everything else */
const makeVersionAwareSpawn = (
  fn: (cmd: readonly string[]) => SpawnResult,
): { spawn: SpawnFn; calls: readonly string[][] } =>
  makeSpawn((cmd) =>
    cmd.includes("--version") ? makeMockProc("1.0.0", 0) : fn(cmd),
  );

describe("createAcpxAdapter", () => {
  it("createSession calls acpx with correct arguments", async () => {
    const { spawn, calls } = makeVersionAwareSpawn(() => makeMockProc("", 0));

    const adapter = createAcpxAdapter({ spawn });
    await adapter.createSession("claude", "test-session", "/tmp/project");

    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual([
      "acpx",
      "claude",
      "sessions",
      "ensure",
      "--name",
      "test-session",
      "--cwd",
      "/tmp/project",
    ]);
  });

  it("prompt parses NDJSON events and calls onEvent", async () => {
    const events: AgentEvent[] = [];
    const ndjson = [
      JSON.stringify({
        eventVersion: 1,
        sessionId: "s1",
        requestId: "r1",
        seq: 1,
        stream: "main",
        type: "thinking",
      }),
      JSON.stringify({
        eventVersion: 1,
        sessionId: "s1",
        requestId: "r1",
        seq: 2,
        stream: "main",
        type: "tool_call",
        tool: "edit_file",
      }),
      JSON.stringify({
        eventVersion: 1,
        sessionId: "s1",
        requestId: "r1",
        seq: 3,
        stream: "main",
        type: "output",
        text: "Done!",
      }),
    ].join("\n");

    const { spawn } = makeVersionAwareSpawn(() =>
      makeMockProc(ndjson + "\n", 0),
    );

    const adapter = createAcpxAdapter({ spawn });
    await adapter.prompt("claude", "s1", "do something", "/tmp", (e) =>
      events.push(e),
    );

    expect(events).toHaveLength(3);
    expect(events[0]!.type).toBe("thinking");
    expect(events[1]!.type).toBe("tool_call");
    expect((events[1] as Record<string, unknown>).tool).toBe("edit_file");
    expect(events[2]!.type).toBe("output");
  });

  it("skips malformed NDJSON lines without crashing", async () => {
    const events: AgentEvent[] = [];
    const ndjson = [
      "not json",
      JSON.stringify({
        eventVersion: 1,
        sessionId: "s1",
        requestId: "r1",
        seq: 1,
        stream: "main",
        type: "thinking",
      }),
      '{"incomplete":',
      "",
    ].join("\n");

    const { spawn } = makeVersionAwareSpawn(() =>
      makeMockProc(ndjson + "\n", 0),
    );

    const adapter = createAcpxAdapter({ spawn });
    await adapter.prompt("claude", "s1", "task", "/tmp", (e) => events.push(e));

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("thinking");
  });

  it("throws actionable error when acpx is not found", async () => {
    const spawn: SpawnFn = () => {
      throw new Error("spawn ENOENT: acpx not found");
    };

    const adapter = createAcpxAdapter({ spawn });
    await expect(adapter.createSession("claude", "s1", "/tmp")).rejects.toThrow(
      "acpx not found",
    );
  });

  it("throws on non-zero exit code from prompt", async () => {
    const { spawn } = makeVersionAwareSpawn(() =>
      makeMockProc("", 1, "agent not found: nonexistent"),
    );

    const adapter = createAcpxAdapter({ spawn });
    await expect(
      adapter.prompt("nonexistent", "s1", "task", "/tmp", () => {}),
    ).rejects.toThrow("agent not found: nonexistent");
  });

  it("uses custom acpx path when provided", async () => {
    const { spawn, calls } = makeSpawn(() => makeMockProc("", 0));

    const adapter = createAcpxAdapter({
      acpxPath: "/usr/local/bin/acpx",
      spawn,
    });
    await adapter.createSession("claude", "s1", "/tmp");

    expect(calls[0]![0]).toBe("/usr/local/bin/acpx");
  });

  it("checks acpx availability only once", async () => {
    let versionCalls = 0;
    const spawn: SpawnFn = (cmd) => {
      if (cmd.includes("--version")) versionCalls++;
      return makeMockProc("", 0);
    };

    const adapter = createAcpxAdapter({ spawn });
    await adapter.createSession("claude", "s1", "/tmp");
    await adapter.createSession("claude", "s2", "/tmp");

    expect(versionCalls).toBe(1);
  });

  it("closeSession calls acpx sessions close", async () => {
    const { spawn, calls } = makeVersionAwareSpawn(() => makeMockProc("", 0));

    const adapter = createAcpxAdapter({ spawn });
    await adapter.closeSession("claude", "my-session", "/tmp/project");

    const closeCall = calls[1]!;
    expect(closeCall).toEqual([
      "acpx",
      "claude",
      "sessions",
      "close",
      "my-session",
      "--cwd",
      "/tmp/project",
    ]);
  });

  it("cancel calls acpx cancel", async () => {
    const { spawn, calls } = makeVersionAwareSpawn(() => makeMockProc("", 0));

    const adapter = createAcpxAdapter({ spawn });
    await adapter.cancel("claude", "my-session", "/tmp/project");

    const cancelCall = calls[1]!;
    expect(cancelCall).toEqual([
      "acpx",
      "claude",
      "cancel",
      "--name",
      "my-session",
      "--cwd",
      "/tmp/project",
    ]);
  });
});
