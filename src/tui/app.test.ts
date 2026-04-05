import { describe, it, expect, vi } from "vitest";
import { createApp } from "./app.js";
import type { View } from "./view.js";
import type { Screen } from "./screen.js";
import type { KeyEvent } from "./keys.js";

const makeKey = (name: string, ctrl = false): KeyEvent => ({
  name,
  ctrl,
  shift: false,
  raw: Buffer.alloc(0),
});

const makeMockScreen = (): Screen & {
  lines: Map<number, string>;
  rawMode: boolean;
  cursorHidden: boolean;
} => {
  const lines = new Map<number, string>();
  return {
    rows: 24,
    cols: 80,
    lines,
    rawMode: false,
    cursorHidden: false,
    enterRawMode: vi.fn(function (this: { rawMode: boolean }) {
      this.rawMode = true;
    }),
    exitRawMode: vi.fn(function (this: { rawMode: boolean }) {
      this.rawMode = false;
    }),
    onKey: vi.fn(),
    clear: vi.fn(),
    hideCursor: vi.fn(function (this: { cursorHidden: boolean }) {
      this.cursorHidden = true;
    }),
    showCursor: vi.fn(function (this: { cursorHidden: boolean }) {
      this.cursorHidden = false;
    }),
    moveTo: vi.fn(),
    write: vi.fn(),
    writeLine: vi.fn((row: number, text: string) => lines.set(row, text)),
    destroy: vi.fn(),
  };
};

const makeMockView = (name: string): View & { rendered: boolean } => ({
  name,
  rendered: false,
  render: vi.fn(function (this: { rendered: boolean }) {
    this.rendered = true;
  }),
  onKey: vi.fn(() => false),
  onEvent: vi.fn(),
});

describe("createApp", () => {
  it("starts with first view active", () => {
    const screen = makeMockScreen();
    const view1 = makeMockView("Dashboard");
    const view2 = makeMockView("Events");
    const app = createApp({
      screen,
      views: [view1, view2],
      onQuit: vi.fn(),
    });

    expect(app.activeView().name).toBe("Dashboard");
  });

  it("switches views with switchView", () => {
    const screen = makeMockScreen();
    const view1 = makeMockView("Dashboard");
    const view2 = makeMockView("Events");
    const app = createApp({
      screen,
      views: [view1, view2],
      onQuit: vi.fn(),
    });

    app.switchView(1);
    expect(app.activeView().name).toBe("Events");
  });

  it("distributes events to all views", () => {
    const screen = makeMockScreen();
    const view1 = makeMockView("Dashboard");
    const view2 = makeMockView("Events");
    const app = createApp({
      screen,
      views: [view1, view2],
      onQuit: vi.fn(),
    });
    app.start();

    const event = {
      type: "daemon:heartbeat",
      timestamp: new Date().toISOString(),
      source: "daemon",
      payload: {},
    } as never;

    app.handleEvent(event);
    expect(view1.onEvent).toHaveBeenCalledWith(event);
    expect(view2.onEvent).toHaveBeenCalledWith(event);
  });

  it("renders header and status bar", () => {
    const screen = makeMockScreen();
    const view1 = makeMockView("Dashboard");
    const app = createApp({
      screen,
      views: [view1],
      projectName: "TestProject",
      onQuit: vi.fn(),
    });
    app.start();
    app.render();

    // Header is row 0, status bar is last row
    expect(screen.lines.has(0)).toBe(true);
    expect(screen.lines.has(23)).toBe(true);
  });

  it("stop restores cursor and exits raw mode", () => {
    const screen = makeMockScreen();
    const app = createApp({
      screen,
      views: [makeMockView("Test")],
      onQuit: vi.fn(),
    });
    app.start();
    app.stop();

    expect(screen.showCursor).toHaveBeenCalled();
    expect(screen.exitRawMode).toHaveBeenCalled();
  });
});
