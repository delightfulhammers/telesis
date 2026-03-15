import { describe, it, expect, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createOversightOrchestrator } from "./orchestrator.js";
import { createEvent } from "../daemon/types.js";
import type { TelesisDaemonEvent } from "../daemon/types.js";
import type { ModelClient } from "../agent/model/client.js";
import type { CompletionResponse } from "../agent/model/types.js";
import type { OversightDeps } from "./types.js";
import { useTempDir } from "../test-utils.js";

const makeTempDir = useTempDir("oversight-orchestrator");

const setupProject = (
  dir: string,
  policies: readonly { name: string; content: string }[] = [],
): void => {
  mkdirSync(join(dir, ".telesis", "agents"), { recursive: true });
  mkdirSync(join(dir, "docs"), { recursive: true });

  // Minimal config
  writeFileSync(
    join(dir, ".telesis", "config.yml"),
    "project:\n  name: TestProject\n  owner: test\n  languages:\n  - TypeScript\n  status: active\n  repo: test\n",
  );

  for (const p of policies) {
    writeFileSync(join(dir, ".telesis", "agents", `${p.name}.md`), p.content);
  }
};

const makeClient = (content: string = "[]"): ModelClient => ({
  complete: vi.fn().mockResolvedValue({
    content,
    usage: { inputTokens: 100, outputTokens: 50 },
    durationMs: 500,
  } as CompletionResponse),
  completeStream: vi.fn(),
});

const makeDeps = (
  dir: string,
  overrides: Partial<OversightDeps> = {},
): OversightDeps => ({
  rootDir: dir,
  sessionId: "test-session-id",
  modelClient: makeClient(),
  onEvent: vi.fn(),
  ...overrides,
});

const reviewerPolicy = `---
name: reviewer
version: 1
enabled: true
autonomy: alert
trigger: periodic
intervalEvents: 5
---

## Role
Monitor for code quality.
`;

const architectPolicy = `---
name: architect
version: 1
enabled: true
autonomy: alert
trigger: periodic
intervalEvents: 10
---

## Role
Detect spec drift.
`;

const chroniclerPolicy = `---
name: chronicler
version: 1
enabled: true
autonomy: observe
trigger: on-complete
---

## Role
Extract insights.
`;

describe("createOversightOrchestrator", () => {
  it("returns null when no policy files exist", () => {
    const dir = makeTempDir();
    setupProject(dir);
    const orch = createOversightOrchestrator(makeDeps(dir));
    expect(orch).toBeNull();
  });

  it("returns null when all policies are disabled", () => {
    const dir = makeTempDir();
    setupProject(dir, [
      {
        name: "reviewer",
        content: "---\nname: reviewer\nenabled: false\n---\n\nBody.",
      },
    ]);
    const orch = createOversightOrchestrator(makeDeps(dir));
    expect(orch).toBeNull();
  });

  it("creates orchestrator with enabled policies", () => {
    const dir = makeTempDir();
    setupProject(dir, [{ name: "reviewer", content: reviewerPolicy }]);

    const orch = createOversightOrchestrator(makeDeps(dir));
    expect(orch).not.toBeNull();
    expect(orch!.receive).toBeInstanceOf(Function);
    expect(orch!.drain).toBeInstanceOf(Function);
  });

  it("fans out events to all observers via receive", () => {
    const dir = makeTempDir();
    setupProject(dir, [
      { name: "reviewer", content: reviewerPolicy },
      { name: "architect", content: architectPolicy },
    ]);

    const client = makeClient("[]");
    const orch = createOversightOrchestrator(
      makeDeps(dir, { modelClient: client }),
    );

    const event = createEvent("dispatch:agent:tool_call", {
      sessionId: "s1",
      agent: "claude",
      seq: 1,
      data: { tool: "edit" },
    });

    // Should not throw
    orch!.receive(event);
  });

  it("drain returns summary with finding and note counts", async () => {
    const dir = makeTempDir();
    setupProject(dir, [{ name: "reviewer", content: reviewerPolicy }]);

    const client = makeClient(
      JSON.stringify([
        { severity: "warning", summary: "Found issue", detail: "desc" },
      ]),
    );
    const onEvent = vi.fn();
    const orch = createOversightOrchestrator(
      makeDeps(dir, { modelClient: client, onEvent }),
    );

    // Feed some events to trigger analysis on drain
    for (let i = 0; i < 3; i++) {
      orch!.receive(
        createEvent("dispatch:agent:tool_call", {
          sessionId: "s1",
          agent: "claude",
          seq: i,
          data: {},
        }),
      );
    }

    const summary = await orch!.drain();
    expect(summary.findingCount).toBeGreaterThanOrEqual(1);
    expect(summary.intervened).toBe(false);
  });

  it("emits oversight:finding events for alert autonomy", async () => {
    const dir = makeTempDir();
    setupProject(dir, [{ name: "reviewer", content: reviewerPolicy }]);

    const client = makeClient(
      JSON.stringify([
        { severity: "warning", summary: "Test finding", detail: "x" },
      ]),
    );
    const onEvent = vi.fn();
    const orch = createOversightOrchestrator(
      makeDeps(dir, { modelClient: client, onEvent }),
    );

    orch!.receive(
      createEvent("dispatch:agent:tool_call", {
        sessionId: "s1",
        agent: "claude",
        seq: 1,
        data: {},
      }),
    );

    await orch!.drain();

    const findingEvents = onEvent.mock.calls
      .map((c) => c[0] as TelesisDaemonEvent)
      .filter((e) => e.type === "oversight:finding");

    expect(findingEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("skips disabled policies", async () => {
    const dir = makeTempDir();
    setupProject(dir, [
      {
        name: "reviewer",
        content: "---\nname: reviewer\nenabled: false\n---\n\nBody.",
      },
      { name: "architect", content: architectPolicy },
    ]);

    const client = makeClient("[]");
    const orch = createOversightOrchestrator(
      makeDeps(dir, { modelClient: client }),
    );

    // Only architect should be active
    expect(orch).not.toBeNull();
  });

  it("handles chronicler notes and emits oversight:note events", async () => {
    const dir = makeTempDir();
    setupProject(dir, [{ name: "chronicler", content: chroniclerPolicy }]);

    const client = makeClient(
      JSON.stringify([{ text: "Insight about patterns", tags: ["pattern"] }]),
    );
    const onEvent = vi.fn();
    const orch = createOversightOrchestrator(
      makeDeps(dir, { modelClient: client, onEvent }),
    );

    orch!.receive(
      createEvent("dispatch:agent:output", {
        sessionId: "s1",
        agent: "claude",
        seq: 1,
        data: { text: "done" },
      }),
    );

    const summary = await orch!.drain();
    expect(summary.noteCount).toBeGreaterThanOrEqual(1);

    const noteEvents = onEvent.mock.calls
      .map((c) => c[0] as TelesisDaemonEvent)
      .filter((e) => e.type === "oversight:note");

    expect(noteEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("does not emit events for observe autonomy findings", async () => {
    const dir = makeTempDir();
    const observePolicy = `---
name: reviewer
version: 1
enabled: true
autonomy: observe
trigger: periodic
intervalEvents: 1
---

Body.
`;
    setupProject(dir, [{ name: "reviewer", content: observePolicy }]);

    const client = makeClient(
      JSON.stringify([
        { severity: "warning", summary: "Silent finding", detail: "x" },
      ]),
    );
    const onEvent = vi.fn();
    const orch = createOversightOrchestrator(
      makeDeps(dir, { modelClient: client, onEvent }),
    );

    orch!.receive(
      createEvent("dispatch:agent:tool_call", {
        sessionId: "s1",
        agent: "claude",
        seq: 1,
        data: {},
      }),
    );

    await orch!.drain();

    const findingEvents = onEvent.mock.calls
      .map((c) => c[0] as TelesisDaemonEvent)
      .filter((e) => e.type === "oversight:finding");

    expect(findingEvents).toHaveLength(0);
  });

  it("calls requestCancel on intervene + critical finding", async () => {
    const dir = makeTempDir();
    const intervenePolicy = `---
name: reviewer
version: 1
enabled: true
autonomy: intervene
trigger: periodic
intervalEvents: 1
---

Body.
`;
    setupProject(dir, [{ name: "reviewer", content: intervenePolicy }]);

    const client = makeClient(
      JSON.stringify([
        { severity: "critical", summary: "Critical issue", detail: "x" },
      ]),
    );
    const onEvent = vi.fn();
    const requestCancel = vi.fn().mockResolvedValue(undefined);
    const orch = createOversightOrchestrator(
      makeDeps(dir, { modelClient: client, onEvent, requestCancel }),
    );

    orch!.receive(
      createEvent("dispatch:agent:tool_call", {
        sessionId: "s1",
        agent: "claude",
        seq: 1,
        data: {},
      }),
    );

    const summary = await orch!.drain();
    expect(summary.intervened).toBe(true);
    expect(requestCancel).toHaveBeenCalled();

    const interventionEvents = onEvent.mock.calls
      .map((c) => c[0] as TelesisDaemonEvent)
      .filter((e) => e.type === "oversight:intervention");

    expect(interventionEvents.length).toBeGreaterThanOrEqual(1);
  });
});
