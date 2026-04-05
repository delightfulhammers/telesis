/** Reusable selectable list component for TUI views. */

import type { KeyEvent } from "./keys.js";

export interface SelectableList<T> {
  readonly cursor: () => number;
  readonly items: () => readonly T[];
  readonly selected: () => T | undefined;
  readonly setItems: (items: readonly T[]) => void;
  readonly onKey: (key: KeyEvent) => boolean;
  readonly visibleRange: (height: number) => { start: number; end: number };
}

export const createSelectableList = <T>(
  initialItems: readonly T[] = [],
): SelectableList<T> => {
  let items: readonly T[] = initialItems;
  let cursorPos = 0;
  let scrollOffset = 0;

  const clampCursor = (): void => {
    if (items.length === 0) {
      cursorPos = 0;
      return;
    }
    cursorPos = Math.max(0, Math.min(cursorPos, items.length - 1));
  };

  const setItems = (newItems: readonly T[]): void => {
    items = newItems;
    clampCursor();
  };

  const onKey = (key: KeyEvent): boolean => {
    if (items.length === 0) return false;

    switch (key.name) {
      case "up":
        cursorPos = Math.max(0, cursorPos - 1);
        return true;
      case "down":
        cursorPos = Math.min(items.length - 1, cursorPos + 1);
        return true;
      case "home":
        cursorPos = 0;
        return true;
      case "end":
        cursorPos = items.length - 1;
        return true;
      case "pageup":
        cursorPos = Math.max(0, cursorPos - 10);
        return true;
      case "pagedown":
        cursorPos = Math.min(items.length - 1, cursorPos + 10);
        return true;
      default:
        return false;
    }
  };

  const visibleRange = (height: number): { start: number; end: number } => {
    if (items.length === 0) return { start: 0, end: 0 };

    // Adjust scroll to keep cursor visible
    if (cursorPos < scrollOffset) scrollOffset = cursorPos;
    if (cursorPos >= scrollOffset + height)
      scrollOffset = cursorPos - height + 1;
    scrollOffset = Math.max(0, scrollOffset);

    const start = scrollOffset;
    const end = Math.min(items.length, start + height);
    return { start, end };
  };

  return {
    cursor: () => cursorPos,
    items: () => items,
    selected: () => (items.length > 0 ? items[cursorPos] : undefined),
    setItems,
    onKey,
    visibleRange,
  };
};
