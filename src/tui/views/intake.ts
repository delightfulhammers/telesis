/** Intake view — browse and manage work items. */

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
  inverse,
} from "../colors.js";
import type { WorkItem } from "../../intake/types.js";

const STATUS_COLORS: Record<string, (s: string) => string> = {
  pending: yellow,
  approved: cyan,
  dispatching: cyan,
  completed: green,
  failed: red,
  skipped: gray,
};

const formatItem = (
  item: WorkItem,
  selected: boolean,
  width: number,
): string => {
  const color = STATUS_COLORS[item.status] ?? dim;
  const status = color(item.status.padEnd(12));
  const id = dim(item.id.slice(0, 8));
  const source = dim(`[${item.source}]`);
  const title = item.title;
  const line = `  ${selected ? "▸" : " "} ${status} ${id} ${source} ${title}`;
  return fitWidth(line, width);
};

export interface IntakeViewDeps {
  readonly loadItems: () => readonly WorkItem[];
  readonly onApprove?: (item: WorkItem) => void;
  readonly onSkip?: (item: WorkItem) => void;
  readonly onPlan?: (item: WorkItem) => void;
}

export const createIntakeView = (deps: IntakeViewDeps): View => {
  const list = createSelectableList(deps.loadItems());
  let message = "";

  const refresh = (): void => {
    list.setItems(deps.loadItems());
    message = "";
  };

  const render = (screen: Screen, startRow: number, endRow: number): void => {
    const width = screen.cols;
    let row = startRow;

    // Header
    screen.writeLine(
      row,
      fitWidth(
        `  ${bold("Intake")} — ${list.items().length} work items  ${dim("[a]pprove [s]kip [p]lan [r]efresh")}`,
        width,
      ),
    );
    row++;

    if (message) {
      screen.writeLine(row, fitWidth(`  ${message}`, width));
      row++;
    }

    const contentHeight = endRow - row;
    const items = list.items();

    if (items.length === 0) {
      screen.writeLine(
        row,
        fitWidth(
          `  ${dim("No work items. Run 'telesis intake github' or 'telesis intake jira' to import.")}`,
          width,
        ),
      );
      row++;
    } else {
      const { start, end } = list.visibleRange(contentHeight);
      for (let i = start; i < end; i++) {
        const selected = i === list.cursor();
        screen.writeLine(row, formatItem(items[i], selected, width));
        row++;
      }
    }

    while (row < endRow) {
      screen.writeLine(row, " ".repeat(width));
      row++;
    }
  };

  const onKey = (key: KeyEvent): boolean => {
    // List navigation
    if (list.onKey(key)) return true;

    const item = list.selected();

    switch (key.name) {
      case "r":
        refresh();
        message = green("Refreshed");
        return true;
      case "a":
        if (item && item.status === "pending") {
          deps.onApprove?.(item);
          message = green(`Approved: ${item.title.slice(0, 40)}`);
          refresh();
        }
        return true;
      case "s":
        if (item && item.status === "pending") {
          deps.onSkip?.(item);
          message = yellow(`Skipped: ${item.title.slice(0, 40)}`);
          refresh();
        }
        return true;
      case "p":
        if (item && item.status === "pending") {
          deps.onPlan?.(item);
          message = cyan(`Planning: ${item.title.slice(0, 40)}`);
          refresh();
        }
        return true;
      default:
        return false;
    }
  };

  return { name: "Intake", render, onKey };
};
