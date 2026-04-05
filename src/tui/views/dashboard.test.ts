import { describe, it, expect } from "vitest";
import { createDashboardView } from "./dashboard.js";
import type { DashboardState } from "./dashboard.js";
import type { TelesisDaemonEvent } from "../../daemon/types.js";

const defaultState: DashboardState = {
  projectName: "TestProject",
  projectStatus: "active",
  version: "1.0.0",
  milestone: "v1.0.0 — TUI",
  milestoneStatus: "Active",
  orchestratorState: "idle",
  pendingDecisions: 0,
  activeSessions: 0,
  completedSessions: 3,
  failedSessions: 1,
  recentEvents: [],
};

describe("createDashboardView", () => {
  it("creates a view with name Dashboard", () => {
    const view = createDashboardView(defaultState);
    expect(view.name).toBe("Dashboard");
  });

  it("onKey returns false (no view-specific bindings)", () => {
    const view = createDashboardView(defaultState);
    expect(
      view.onKey({
        name: "a",
        ctrl: false,
        shift: false,
        raw: Buffer.alloc(0),
      }),
    ).toBe(false);
  });

  it("accumulates events via onEvent", () => {
    const view = createDashboardView(defaultState);
    const event: TelesisDaemonEvent = {
      type: "daemon:heartbeat",
      timestamp: new Date().toISOString(),
      source: "daemon",
      payload: {},
    } as TelesisDaemonEvent;

    view.onEvent!(event);
    expect(view.getState().recentEvents).toHaveLength(1);
  });

  it("caps recent events at 20", () => {
    const view = createDashboardView(defaultState);
    for (let i = 0; i < 25; i++) {
      view.onEvent!({
        type: "daemon:heartbeat",
        timestamp: new Date().toISOString(),
        source: "daemon",
        payload: {},
      } as TelesisDaemonEvent);
    }
    expect(view.getState().recentEvents).toHaveLength(20);
  });

  it("renders without throwing", () => {
    const view = createDashboardView(defaultState);
    const lines: string[] = [];
    const mockScreen = {
      rows: 24,
      cols: 80,
      writeLine: (_row: number, text: string) => lines.push(text),
    };
    // Should not throw
    view.render(mockScreen as never, 0, 20);
    expect(lines.length).toBeGreaterThan(0);
  });
});
