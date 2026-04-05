import { describe, it, expect } from "vitest";
import { createDispatchView } from "./dispatch.js";
import type { SessionInfo } from "./dispatch.js";

const makeSession = (id: string, status = "completed"): SessionInfo => ({
  id,
  agent: "claude",
  task: "Fix the login bug",
  status,
  startedAt: new Date().toISOString(),
  eventCount: 42,
});

describe("createDispatchView", () => {
  it("creates a view named Dispatch", () => {
    const view = createDispatchView({ loadSessions: () => [] });
    expect(view.name).toBe("Dispatch");
  });

  it("renders sessions", () => {
    const sessions = [makeSession("abc"), makeSession("def", "running")];
    const view = createDispatchView({ loadSessions: () => sessions });

    const lines: string[] = [];
    const mockScreen = {
      rows: 24,
      cols: 80,
      writeLine: (_row: number, text: string) => lines.push(text),
    };
    view.render(mockScreen as never, 0, 20);
    expect(lines.length).toBeGreaterThan(0);
  });

  it("handles arrow key navigation", () => {
    const sessions = [makeSession("a"), makeSession("b")];
    const view = createDispatchView({ loadSessions: () => sessions });
    expect(
      view.onKey({
        name: "down",
        ctrl: false,
        shift: false,
        raw: Buffer.alloc(0),
      }),
    ).toBe(true);
  });
});
