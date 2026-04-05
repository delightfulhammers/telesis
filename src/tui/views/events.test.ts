import { describe, it, expect } from "vitest";
import { createEventsView } from "./events.js";
import type { TelesisDaemonEvent } from "../../daemon/types.js";

const makeEvent = (type: string, idx: number): TelesisDaemonEvent =>
  ({
    type,
    timestamp: new Date().toISOString(),
    source: type.split(":")[0],
    payload: {},
  }) as TelesisDaemonEvent;

describe("createEventsView", () => {
  it("creates a view with name Events", () => {
    const view = createEventsView();
    expect(view.name).toBe("Events");
  });

  it("starts with empty events and auto-scroll", () => {
    const view = createEventsView();
    const state = view.getState();
    expect(state.events).toHaveLength(0);
    expect(state.autoScroll).toBe(true);
    expect(state.filter).toBe("all");
  });

  it("accumulates events via onEvent", () => {
    const view = createEventsView();
    view.onEvent!(makeEvent("daemon:heartbeat", 0));
    view.onEvent!(makeEvent("fs:change", 1));
    expect(view.getState().events).toHaveLength(2);
  });

  it("scrolls up with arrow key", () => {
    const view = createEventsView();
    for (let i = 0; i < 50; i++) {
      view.onEvent!(makeEvent("daemon:heartbeat", i));
    }

    const handled = view.onKey({
      name: "up",
      ctrl: false,
      shift: false,
      raw: Buffer.alloc(0),
    });
    expect(handled).toBe(true);
    expect(view.getState().autoScroll).toBe(false);
  });

  it("re-enables auto-scroll at End key", () => {
    const view = createEventsView();
    // Disable auto-scroll
    view.onKey({
      name: "up",
      ctrl: false,
      shift: false,
      raw: Buffer.alloc(0),
    });
    expect(view.getState().autoScroll).toBe(false);

    // Press End
    view.onKey({
      name: "end",
      ctrl: false,
      shift: false,
      raw: Buffer.alloc(0),
    });
    expect(view.getState().autoScroll).toBe(true);
  });

  it("cycles filter with f key", () => {
    const view = createEventsView();
    expect(view.getState().filter).toBe("all");

    view.onKey({
      name: "f",
      ctrl: false,
      shift: false,
      raw: Buffer.alloc(0),
    });
    expect(view.getState().filter).toBe("daemon");

    view.onKey({
      name: "f",
      ctrl: false,
      shift: false,
      raw: Buffer.alloc(0),
    });
    expect(view.getState().filter).toBe("fs");
  });

  it("returns false for unhandled keys", () => {
    const view = createEventsView();
    const handled = view.onKey({
      name: "x",
      ctrl: false,
      shift: false,
      raw: Buffer.alloc(0),
    });
    expect(handled).toBe(false);
  });

  it("handles pageup/pagedown", () => {
    const view = createEventsView();
    for (let i = 0; i < 100; i++) {
      view.onEvent!(makeEvent("daemon:heartbeat", i));
    }

    const handled = view.onKey({
      name: "pageup",
      ctrl: false,
      shift: false,
      raw: Buffer.alloc(0),
    });
    expect(handled).toBe(true);
    expect(view.getState().autoScroll).toBe(false);
  });

  it("renders without throwing", () => {
    const view = createEventsView();
    for (let i = 0; i < 5; i++) {
      view.onEvent!(makeEvent("daemon:heartbeat", i));
    }

    const lines: string[] = [];
    const mockScreen = {
      rows: 24,
      cols: 80,
      writeLine: (_row: number, text: string) => lines.push(text),
    };
    view.render(mockScreen as never, 0, 20);
    expect(lines.length).toBeGreaterThan(0);
  });
});
