import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createSessionReactor,
  mapExitReason,
  type SessionReactorDeps,
} from "./session-reactor.js";
import { createEvent } from "./types.js";
import type { OrchestratorContext } from "../orchestrator/types.js";

const makeContext = (
  overrides: Partial<OrchestratorContext> = {},
): OrchestratorContext => ({
  state: "executing",
  workItemIds: ["wi-1"],
  updatedAt: "2026-03-25T00:00:00Z",
  milestoneId: "0.29.0",
  planId: "plan-1",
  ...overrides,
});

const makeDeps = (
  ctx: OrchestratorContext | null = makeContext(),
): SessionReactorDeps => ({
  config: {},
  loadContext: vi.fn().mockReturnValue(ctx),
  saveContext: vi.fn(),
  advance: vi.fn().mockResolvedValue({ context: ctx, waiting: false }),
  buildRunnerDeps: vi.fn().mockReturnValue({}),
  notify: vi.fn(),
});

describe("mapExitReason", () => {
  it("maps completed to clean", () => {
    const event = createEvent("dispatch:session:completed", {
      sessionId: "s1",
      agent: "claude",
      task: "test",
      durationMs: 1000,
      eventCount: 10,
    });
    expect(mapExitReason(event)).toBe("clean");
  });

  it("maps failed with hook error to hook_block", () => {
    const event = createEvent("dispatch:session:failed", {
      sessionId: "s1",
      agent: "claude",
      task: "test",
      error: "acpx prompt exited: preflight check failed",
    });
    expect(mapExitReason(event)).toBe("hook_block");
  });

  it("maps failed with hook keyword to hook_block", () => {
    const event = createEvent("dispatch:session:failed", {
      sessionId: "s1",
      agent: "claude",
      task: "test",
      error: "pre-commit hook blocked the commit",
    });
    expect(mapExitReason(event)).toBe("hook_block");
  });

  it("maps failed with context keyword to context_full", () => {
    const event = createEvent("dispatch:session:failed", {
      sessionId: "s1",
      agent: "claude",
      task: "test",
      error: "context window exceeded maximum token limit",
    });
    expect(mapExitReason(event)).toBe("context_full");
  });

  it("maps failed with token keyword to context_full", () => {
    const event = createEvent("dispatch:session:failed", {
      sessionId: "s1",
      agent: "claude",
      task: "test",
      error: "token limit reached",
    });
    expect(mapExitReason(event)).toBe("context_full");
  });

  it("maps other failures to error", () => {
    const event = createEvent("dispatch:session:failed", {
      sessionId: "s1",
      agent: "claude",
      task: "test",
      error: "something went wrong",
    });
    expect(mapExitReason(event)).toBe("error");
  });
});

describe("createSessionReactor", () => {
  it("ignores non-dispatch events", () => {
    const deps = makeDeps();
    const reactor = createSessionReactor(deps);

    reactor(createEvent("daemon:heartbeat", { uptimeMs: 1000, eventCount: 5 }));

    expect(deps.saveContext).not.toHaveBeenCalled();
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("ignores events when orchestrator is idle", () => {
    const deps = makeDeps(makeContext({ state: "idle" }));
    const reactor = createSessionReactor(deps);

    reactor(
      createEvent("dispatch:session:completed", {
        sessionId: "s1",
        agent: "claude",
        task: "test",
        durationMs: 1000,
        eventCount: 10,
      }),
    );

    expect(deps.saveContext).not.toHaveBeenCalled();
  });

  it("ignores events when no orchestrator context", () => {
    const deps = makeDeps(null);
    const reactor = createSessionReactor(deps);

    reactor(
      createEvent("dispatch:session:completed", {
        sessionId: "s1",
        agent: "claude",
        task: "test",
        durationMs: 1000,
        eventCount: 10,
      }),
    );

    expect(deps.saveContext).not.toHaveBeenCalled();
  });

  it("updates context with exit reason on session completed", () => {
    const deps = makeDeps();
    const reactor = createSessionReactor(deps);

    reactor(
      createEvent("dispatch:session:completed", {
        sessionId: "s1",
        agent: "claude",
        task: "test",
        durationMs: 1000,
        eventCount: 10,
      }),
    );

    expect(deps.saveContext).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionExitReason: "clean",
        sessionEndedAt: expect.any(String),
      }),
    );
  });

  it("updates context with exit reason on session failed", () => {
    const deps = makeDeps();
    const reactor = createSessionReactor(deps);

    reactor(
      createEvent("dispatch:session:failed", {
        sessionId: "s1",
        agent: "claude",
        task: "test",
        error: "something broke",
      }),
    );

    expect(deps.saveContext).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionExitReason: "error",
      }),
    );
  });

  describe("notify-only policy (default)", () => {
    it("sends notification on session end", () => {
      const deps = makeDeps();
      const reactor = createSessionReactor(deps);

      reactor(
        createEvent("dispatch:session:completed", {
          sessionId: "s1",
          agent: "claude",
          task: "test",
          durationMs: 1000,
          eventCount: 10,
        }),
      );

      expect(deps.notify).toHaveBeenCalledWith(
        "Session ended",
        expect.stringContaining("orchestrator run"),
      );
    });

    it("does not call advance", () => {
      const deps = makeDeps();
      const reactor = createSessionReactor(deps);

      reactor(
        createEvent("dispatch:session:completed", {
          sessionId: "s1",
          agent: "claude",
          task: "test",
          durationMs: 1000,
          eventCount: 10,
        }),
      );

      expect(deps.advance).not.toHaveBeenCalled();
    });
  });

  describe("manual policy", () => {
    it("does not notify or advance", () => {
      const deps = makeDeps();
      deps.config = { restartPolicy: "manual" };
      // Recreate with manual policy
      const manualDeps = {
        ...deps,
        config: { restartPolicy: "manual" as const },
      };
      const reactor = createSessionReactor(manualDeps);

      reactor(
        createEvent("dispatch:session:completed", {
          sessionId: "s1",
          agent: "claude",
          task: "test",
          durationMs: 1000,
          eventCount: 10,
        }),
      );

      expect(manualDeps.notify).not.toHaveBeenCalled();
      expect(manualDeps.advance).not.toHaveBeenCalled();
    });
  });

  describe("auto-restart policy", () => {
    it("calls advance on session end", () => {
      const deps = {
        ...makeDeps(),
        config: { restartPolicy: "auto-restart" as const },
      };
      const reactor = createSessionReactor(deps);

      reactor(
        createEvent("dispatch:session:completed", {
          sessionId: "s1",
          agent: "claude",
          task: "test",
          durationMs: 1000,
          eventCount: 10,
        }),
      );

      expect(deps.advance).toHaveBeenCalled();
    });

    it("trips circuit breaker after max restarts", () => {
      const deps = {
        ...makeDeps(),
        config: {
          restartPolicy: "auto-restart" as const,
          maxRestartsPerMilestone: 2,
          cooldownSeconds: 0,
        },
      };
      const reactor = createSessionReactor(deps);

      const event = createEvent("dispatch:session:completed", {
        sessionId: "s1",
        agent: "claude",
        task: "test",
        durationMs: 1000,
        eventCount: 10,
      });

      // First two restarts should advance
      reactor(event);
      reactor(event);
      expect(deps.advance).toHaveBeenCalledTimes(2);

      // Third should trip circuit breaker
      reactor(event);
      expect(deps.advance).toHaveBeenCalledTimes(2); // no additional call
      expect(deps.notify).toHaveBeenCalledWith(
        "Circuit breaker tripped",
        expect.stringContaining("Manual intervention"),
      );
    });

    it("resets circuit breaker on milestone change", () => {
      const ctx1 = makeContext({ milestoneId: "0.28.0" });
      const ctx2 = makeContext({ milestoneId: "0.29.0" });
      let currentCtx = ctx1;

      const deps = {
        ...makeDeps(),
        config: {
          restartPolicy: "auto-restart" as const,
          maxRestartsPerMilestone: 1,
          cooldownSeconds: 0,
        },
        loadContext: vi.fn(() => currentCtx),
      };
      const reactor = createSessionReactor(deps);

      const event = createEvent("dispatch:session:completed", {
        sessionId: "s1",
        agent: "claude",
        task: "test",
        durationMs: 1000,
        eventCount: 10,
      });

      // First milestone — one restart allowed
      reactor(event);
      expect(deps.advance).toHaveBeenCalledTimes(1);

      // Should trip circuit breaker
      reactor(event);
      expect(deps.advance).toHaveBeenCalledTimes(1);

      // Switch milestone
      currentCtx = ctx2;
      reactor(event);
      // Circuit breaker reset — should advance again
      expect(deps.advance).toHaveBeenCalledTimes(2);
    });
  });
});

describe("config parsing", () => {
  // Config parsing is tested via the existing config.test.ts pattern
  // These tests verify the session reactor respects config values

  it("uses default cooldown of 30s", () => {
    const deps = {
      ...makeDeps(),
      config: { restartPolicy: "auto-restart" as const },
    };
    const reactor = createSessionReactor(deps);

    const event = createEvent("dispatch:session:completed", {
      sessionId: "s1",
      agent: "claude",
      task: "test",
      durationMs: 1000,
      eventCount: 10,
    });

    // First call should work (no cooldown yet)
    reactor(event);
    expect(deps.advance).toHaveBeenCalledTimes(1);

    // Second call within 30s should trigger cooldown (notify, no immediate advance)
    reactor(event);
    // advance should still be 1 (cooldown prevents immediate restart)
    expect(deps.advance).toHaveBeenCalledTimes(1);
    expect(deps.notify).toHaveBeenCalledWith(
      "Cooldown active",
      expect.any(String),
    );
  });

  it("uses default max restarts of 10", () => {
    const deps = {
      ...makeDeps(),
      config: {
        restartPolicy: "auto-restart" as const,
        cooldownSeconds: 0,
      },
    };
    const reactor = createSessionReactor(deps);

    const event = createEvent("dispatch:session:completed", {
      sessionId: "s1",
      agent: "claude",
      task: "test",
      durationMs: 1000,
      eventCount: 10,
    });

    for (let i = 0; i < 10; i++) reactor(event);
    expect(deps.advance).toHaveBeenCalledTimes(10);

    // 11th should trip
    reactor(event);
    expect(deps.advance).toHaveBeenCalledTimes(10);
  });
});
