/** Dispatch view — monitor agent sessions. */

import type { Screen } from "../screen.js";
import type { KeyEvent } from "../keys.js";
import type { View } from "../view.js";
import { createSelectableList } from "../list.js";
import {
  bold,
  dim,
  cyan,
  green,
  yellow,
  red,
  gray,
  fitWidth,
} from "../colors.js";

export interface SessionInfo {
  readonly id: string;
  readonly agent: string;
  readonly task: string;
  readonly status: string;
  readonly startedAt: string;
  readonly eventCount: number;
}

const STATUS_COLORS: Record<string, (s: string) => string> = {
  running: cyan,
  completed: green,
  failed: red,
  cancelled: gray,
};

const formatSession = (
  session: SessionInfo,
  selected: boolean,
  width: number,
): string => {
  const color = STATUS_COLORS[session.status] ?? dim;
  const status = color(session.status.padEnd(12));
  const id = dim(session.id.slice(0, 8));
  const agent = dim(`[${session.agent}]`);
  const task = session.task.slice(0, 40);
  const line = `  ${selected ? "▸" : " "} ${status} ${id} ${agent} ${task}`;
  return fitWidth(line, width);
};

export interface DispatchViewDeps {
  readonly loadSessions: () => readonly SessionInfo[];
}

export const createDispatchView = (deps: DispatchViewDeps): View => {
  const list = createSelectableList(deps.loadSessions());

  const refresh = (): void => {
    list.setItems(deps.loadSessions());
  };

  const render = (screen: Screen, startRow: number, endRow: number): void => {
    const width = screen.cols;
    let row = startRow;

    screen.writeLine(
      row,
      fitWidth(
        `  ${bold("Dispatch")} — ${list.items().length} sessions  ${dim("[r]efresh")}`,
        width,
      ),
    );
    row++;

    const contentHeight = endRow - row;
    const items = list.items();

    if (items.length === 0) {
      screen.writeLine(
        row,
        fitWidth(`  ${dim("No dispatch sessions.")}`, width),
      );
      row++;
    } else {
      const { start, end } = list.visibleRange(contentHeight);
      for (let i = start; i < end; i++) {
        screen.writeLine(
          row,
          formatSession(items[i], i === list.cursor(), width),
        );
        row++;
      }
    }

    while (row < endRow) {
      screen.writeLine(row, " ".repeat(width));
      row++;
    }
  };

  const onKey = (key: KeyEvent): boolean => {
    if (key.name === "r") {
      refresh();
      return true;
    }
    return list.onKey(key);
  };

  return { name: "Dispatch", render, onKey };
};
