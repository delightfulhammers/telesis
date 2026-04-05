/** Dashboard view — project status at a glance. */

import type { Screen } from "../screen.js";
import type { KeyEvent } from "../keys.js";
import type { View } from "../view.js";
import type { TelesisDaemonEvent } from "../../daemon/types.js";
import { bold, dim, cyan, green, yellow, fitWidth } from "../colors.js";
import { formatEventLine } from "../../daemon/tui.js";

export interface DashboardState {
  readonly projectName: string;
  readonly projectStatus: string;
  readonly version: string;
  readonly milestone: string;
  readonly milestoneStatus: string;
  readonly orchestratorState: string;
  readonly pendingDecisions: number;
  readonly activeSessions: number;
  readonly completedSessions: number;
  readonly failedSessions: number;
  readonly recentEvents: readonly TelesisDaemonEvent[];
}

const MAX_RECENT_EVENTS = 20;

export const createDashboardView = (
  initialState: DashboardState,
): View & { readonly getState: () => DashboardState } => {
  // Mutable internal buffer — exposed as readonly snapshot via getState()
  const recentEvents: TelesisDaemonEvent[] = [...initialState.recentEvents];
  const config = { ...initialState };

  const render = (screen: Screen, startRow: number, endRow: number): void => {
    const width = screen.cols;
    let row = startRow;

    const line = (text: string): void => {
      if (row < endRow) {
        screen.writeLine(row, fitWidth(`  ${text}`, width));
        row++;
      }
    };

    const blank = (): void => line("");

    line(bold("Project: ") + cyan(config.projectName));
    line(
      `Status: ${green(config.projectStatus)}    Version: ${config.version}`,
    );
    line(`Milestone: ${bold(config.milestone)} (${config.milestoneStatus})`);
    blank();

    line(bold(dim("── Orchestrator ──────────────────────────")));
    line(
      `State: ${yellow(config.orchestratorState)}   Decisions: ${config.pendingDecisions} pending`,
    );
    blank();

    line(bold(dim("── Sessions ──────────────────────────────")));
    line(
      `Active: ${config.activeSessions}    Completed: ${green(String(config.completedSessions))}    Failed: ${config.failedSessions > 0 ? yellow(String(config.failedSessions)) : String(config.failedSessions)}`,
    );
    blank();

    line(bold(dim("── Recent Events ─────────────────────────")));
    const availableRows = endRow - row;
    const eventsToShow = recentEvents.slice(-availableRows);
    for (const event of eventsToShow) {
      line(formatEventLine(event));
    }

    // Clear remaining rows
    while (row < endRow) {
      screen.writeLine(row, " ".repeat(width));
      row++;
    }
  };

  const onKey = (_key: KeyEvent): boolean => false;

  const onEvent = (event: TelesisDaemonEvent): void => {
    recentEvents.push(event);
    if (recentEvents.length > MAX_RECENT_EVENTS) recentEvents.shift();
  };

  return {
    name: "Dashboard",
    render,
    onKey,
    onEvent,
    getState: () => ({
      ...config,
      recentEvents: [...recentEvents],
    }),
  };
};
