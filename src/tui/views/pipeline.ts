/** Pipeline view — active pipeline state and quality gate results. */

import type { Screen } from "../screen.js";
import type { KeyEvent } from "../keys.js";
import type { View } from "../view.js";
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

export interface PipelineViewState {
  readonly workItemTitle?: string;
  readonly currentStage?: string;
  readonly branch?: string;
  readonly qualityGates?: readonly {
    name: string;
    passed: boolean | null;
    message?: string;
  }[];
  readonly reviewSummary?: {
    findings: number;
    highOrCritical: number;
  };
  readonly prUrl?: string;
}

export interface PipelineViewDeps {
  readonly loadState: () => PipelineViewState | null;
}

export const createPipelineView = (deps: PipelineViewDeps): View => {
  let state: PipelineViewState | null = null;

  const refresh = (): void => {
    state = deps.loadState();
  };

  refresh();

  const render = (screen: Screen, startRow: number, endRow: number): void => {
    const width = screen.cols;
    let row = startRow;

    const line = (text: string): void => {
      if (row < endRow) {
        screen.writeLine(row, fitWidth(`  ${text}`, width));
        row++;
      }
    };

    line(`${bold("Pipeline")}  ${dim("[r]efresh")}`);

    if (!state) {
      line("");
      line(
        dim(
          "No active pipeline. Use 'telesis run <work-item-id>' to start one.",
        ),
      );
    } else {
      line("");
      if (state.workItemTitle) line(`Work Item: ${cyan(state.workItemTitle)}`);
      if (state.currentStage) line(`Stage: ${bold(state.currentStage)}`);
      if (state.branch) line(`Branch: ${dim(state.branch)}`);
      line("");

      if (state.qualityGates && state.qualityGates.length > 0) {
        line(bold(dim("── Quality Gates ─────────────────────────")));
        for (const gate of state.qualityGates) {
          const icon =
            gate.passed === true
              ? green("✓")
              : gate.passed === false
                ? red("✗")
                : gray("○");
          const msg = gate.message ? dim(` — ${gate.message}`) : "";
          line(`${icon} ${gate.name}${msg}`);
        }
        line("");
      }

      if (state.reviewSummary) {
        line(bold(dim("── Review ────────────────────────────────")));
        const color = state.reviewSummary.highOrCritical > 0 ? red : green;
        line(
          `Findings: ${state.reviewSummary.findings}  High/Critical: ${color(String(state.reviewSummary.highOrCritical))}`,
        );
        line("");
      }

      if (state.prUrl) {
        line(`PR: ${cyan(state.prUrl)}`);
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
    return false;
  };

  return { name: "Pipeline", render, onKey };
};
