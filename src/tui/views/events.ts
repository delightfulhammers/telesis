/** Events view — scrollable, filterable event log. */

import type { Screen } from "../screen.js";
import type { KeyEvent } from "../keys.js";
import type { View } from "../view.js";
import type { TelesisDaemonEvent } from "../../daemon/types.js";
import { bold, dim, gray, fitWidth } from "../colors.js";
import { formatEventLine } from "../../daemon/tui.js";

const EVENT_CATEGORIES = [
  "all",
  "daemon",
  "fs",
  "dispatch",
  "oversight",
  "intake",
  "plan",
  "validation",
  "pipeline",
  "git",
  "github",
  "orchestrator",
] as const;

type EventCategory = (typeof EVENT_CATEGORIES)[number];

const MAX_EVENTS = 5000;

export interface EventsViewState {
  readonly events: readonly TelesisDaemonEvent[];
  readonly scrollOffset: number;
  readonly filter: EventCategory;
  readonly autoScroll: boolean;
}

export const createEventsView = (): View & {
  readonly getState: () => EventsViewState;
} => {
  const allEvents: TelesisDaemonEvent[] = [];
  let scrollOffset = 0;
  let filter: EventCategory = "all";
  let autoScroll = true;
  let lastContentHeight = 20; // Updated each render cycle

  const filteredEvents = (): readonly TelesisDaemonEvent[] =>
    filter === "all"
      ? allEvents
      : allEvents.filter((e) => e.type.startsWith(`${filter}:`));

  const maxOffset = (): number =>
    Math.max(0, filteredEvents().length - lastContentHeight);

  const render = (screen: Screen, startRow: number, endRow: number): void => {
    const width = screen.cols;
    const filtered = filteredEvents();

    // Header line with filter indicator
    const filterLabel = filter === "all" ? dim("all") : bold(filter);
    screen.writeLine(
      startRow,
      fitWidth(
        `  ${bold("Events")} (${filterLabel}) — ${gray(`${filtered.length} total`)}`,
        width,
      ),
    );

    const contentStart = startRow + 1;
    const contentHeight = endRow - contentStart;
    lastContentHeight = contentHeight;

    if (filtered.length === 0) {
      screen.writeLine(
        contentStart,
        fitWidth(`  ${dim("No events yet. Waiting...")}`, width),
      );
      for (let r = contentStart + 1; r < endRow; r++) {
        screen.writeLine(r, " ".repeat(width));
      }
      return;
    }

    // Auto-scroll: keep scrollOffset at the bottom
    if (autoScroll) {
      scrollOffset = Math.max(0, filtered.length - contentHeight);
    }

    // Clamp scroll offset
    scrollOffset = Math.max(0, Math.min(scrollOffset, maxOffset()));

    const visible = filtered.slice(scrollOffset, scrollOffset + contentHeight);
    let row = contentStart;
    for (const event of visible) {
      screen.writeLine(row, fitWidth(`  ${formatEventLine(event)}`, width));
      row++;
    }

    // Clear remaining rows
    while (row < endRow) {
      screen.writeLine(row, " ".repeat(width));
      row++;
    }
  };

  const onKey = (key: KeyEvent): boolean => {
    switch (key.name) {
      case "up":
        autoScroll = false;
        scrollOffset = Math.max(0, scrollOffset - 1);
        return true;
      case "down":
        scrollOffset = Math.min(maxOffset(), scrollOffset + 1);
        if (scrollOffset >= maxOffset()) autoScroll = true;
        return true;
      case "pageup":
        autoScroll = false;
        scrollOffset = Math.max(0, scrollOffset - 20);
        return true;
      case "pagedown":
        scrollOffset = Math.min(maxOffset(), scrollOffset + 20);
        if (scrollOffset >= maxOffset()) autoScroll = true;
        return true;
      case "home":
        autoScroll = false;
        scrollOffset = 0;
        return true;
      case "end":
        autoScroll = true;
        return true;
      case "f": {
        // Cycle filter
        const idx = EVENT_CATEGORIES.indexOf(filter);
        filter = EVENT_CATEGORIES[(idx + 1) % EVENT_CATEGORIES.length];
        scrollOffset = 0;
        autoScroll = true;
        return true;
      }
      default:
        return false;
    }
  };

  const onEvent = (event: TelesisDaemonEvent): void => {
    allEvents.push(event);
    if (allEvents.length > MAX_EVENTS) allEvents.shift();
  };

  return {
    name: "Events",
    render,
    onKey,
    onEvent,
    getState: () => ({
      events: [...allEvents],
      scrollOffset,
      filter,
      autoScroll,
    }),
  };
};
