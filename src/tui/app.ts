/** TUI App — view router, daemon integration, render loop. */

import type { Screen } from "./screen.js";
import type { View } from "./view.js";
import type { KeyEvent } from "./keys.js";
import type { TelesisDaemonEvent } from "../daemon/types.js";
import { bold, dim, inverse, fitWidth } from "./colors.js";

const HEADER_ROWS = 1;
const FOOTER_ROWS = 1;

export interface AppConfig {
  readonly screen: Screen;
  readonly views: readonly View[];
  readonly onQuit: () => void;
  readonly projectName?: string;
}

export interface App {
  readonly start: () => void;
  readonly stop: () => void;
  readonly handleEvent: (event: TelesisDaemonEvent) => void;
  readonly render: () => void;
  readonly activeView: () => View;
  readonly switchView: (index: number) => void;
}

export const createApp = (config: AppConfig): App => {
  const { screen, views, onQuit } = config;
  let activeIndex = 0;
  let running = false;

  const activeView = (): View => views[activeIndex];

  const renderHeader = (): void => {
    const name = config.projectName ?? "Telesis";
    const viewName = activeView().name;
    const header = ` ${name} ── ${viewName} `;
    screen.writeLine(0, inverse(fitWidth(header, screen.cols)));
  };

  const renderStatusBar = (): void => {
    const row = screen.rows - 1;
    const parts = views.map((v, i) => {
      const label = `[${i + 1}] ${v.name}`;
      return i === activeIndex ? bold(label) : dim(label);
    });
    parts.push(dim("[f] Filter"));
    parts.push(dim("[q] Quit"));
    const bar = `  ${parts.join("  ")}`;
    screen.writeLine(row, inverse(fitWidth(bar, screen.cols)));
  };

  const render = (): void => {
    if (!running) return;
    renderHeader();
    activeView().render(screen, HEADER_ROWS, screen.rows - FOOTER_ROWS);
    renderStatusBar();
  };

  const handleKey = (key: KeyEvent): void => {
    // Global bindings
    if (key.name === "q" || (key.ctrl && key.name === "c")) {
      stop();
      onQuit();
      return;
    }

    if (key.ctrl && key.name === "l") {
      screen.clear();
      render();
      return;
    }

    if (key.name === "tab") {
      activeIndex = (activeIndex + 1) % views.length;
      render();
      return;
    }

    // Number keys for direct view switching
    const num = parseInt(key.name, 10);
    if (!isNaN(num) && num >= 1 && num <= views.length) {
      activeIndex = num - 1;
      render();
      return;
    }

    // Delegate to active view
    const handled = activeView().onKey(key);
    if (handled) render();
  };

  const handleEvent = (event: TelesisDaemonEvent): void => {
    for (const view of views) {
      view.onEvent?.(event);
    }
    render();
  };

  const start = (): void => {
    running = true;
    screen.enterRawMode();
    screen.hideCursor();
    screen.clear();
    screen.onKey(handleKey);
    render();
  };

  const stop = (): void => {
    running = false;
    screen.showCursor();
    screen.exitRawMode();
    screen.clear();
  };

  const switchView = (index: number): void => {
    if (index >= 0 && index < views.length) {
      activeIndex = index;
      render();
    }
  };

  return {
    start,
    stop,
    handleEvent,
    render,
    activeView,
    switchView,
  };
};
