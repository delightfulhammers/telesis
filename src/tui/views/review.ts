/** Review view — review sessions and findings summary. */

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

export interface ReviewInfo {
  readonly id: string;
  readonly timestamp: string;
  readonly findingCount: number;
  readonly mode: string;
  readonly durationMs: number;
}

const formatReview = (
  review: ReviewInfo,
  selected: boolean,
  width: number,
): string => {
  const id = dim(review.id.slice(0, 8));
  const date = dim(review.timestamp.slice(0, 10));
  const findings =
    review.findingCount > 0
      ? yellow(`${review.findingCount} findings`)
      : green("0 findings");
  const mode = dim(`[${review.mode}]`);
  const duration = dim(`${(review.durationMs / 1000).toFixed(1)}s`);
  const line = `  ${selected ? "▸" : " "} ${id} ${date} ${findings} ${mode} ${duration}`;
  return fitWidth(line, width);
};

export interface ReviewViewDeps {
  readonly loadSessions: () => readonly ReviewInfo[];
}

export const createReviewView = (deps: ReviewViewDeps): View => {
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
        `  ${bold("Review")} — ${list.items().length} sessions  ${dim("[r]efresh")}`,
        width,
      ),
    );
    row++;

    const contentHeight = endRow - row;
    const items = list.items();

    if (items.length === 0) {
      screen.writeLine(
        row,
        fitWidth(
          `  ${dim("No review sessions. Run 'telesis review' to start one.")}`,
          width,
        ),
      );
      row++;
    } else {
      const { start, end } = list.visibleRange(contentHeight);
      for (let i = start; i < end; i++) {
        screen.writeLine(
          row,
          formatReview(items[i], i === list.cursor(), width),
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

  return { name: "Review", render, onKey };
};
