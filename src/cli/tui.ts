import { Command } from "commander";
import { handleAction } from "./handle-action.js";
import { projectRoot } from "./project-root.js";
import { connect } from "../daemon/client.js";
import { readPid, isRunning } from "../daemon/pid.js";
import { load } from "../config/config.js";
import { createScreen } from "../tui/screen.js";
import { createApp } from "../tui/app.js";
import { createDashboardView } from "../tui/views/dashboard.js";
import { createEventsView } from "../tui/views/events.js";
import { createIntakeView } from "../tui/views/intake.js";
import { createPipelineView } from "../tui/views/pipeline.js";
import { createDispatchView } from "../tui/views/dispatch.js";
import { createReviewView } from "../tui/views/review.js";
import { getStatus } from "../status/status.js";
import { listWorkItems } from "../intake/store.js";
import { skipWorkItem } from "../intake/approve.js";
import { listSessions } from "../dispatch/store.js";
import { listReviewSessions } from "../agent/review/store.js";
import { loadPipelineState } from "../pipeline/state.js";
import { VERSION } from "../version.js";
import type { WorkItemStatus } from "../intake/types.js";

export const tuiCommand = new Command("tui")
  .description("Interactive terminal UI for monitoring and managing Telesis")
  .action(
    handleAction(async () => {
      const rootDir = projectRoot();

      // Check daemon is running
      const pid = readPid(rootDir);
      if (!pid || !isRunning(pid)) {
        throw new Error(
          "Telesis daemon is not running. Start it with `telesis daemon start`.",
        );
      }

      // Load project state for dashboard
      const cfg = load(rootDir);
      const status = await getStatus(rootDir);

      // Connect to daemon first
      const client = await connect(rootDir);

      // Create views
      const dashboard = createDashboardView({
        projectName: cfg.project.name,
        projectStatus: cfg.project.status || "active",
        version: VERSION,
        milestone: status.activeMilestone ?? "none",
        milestoneStatus: "—",
        orchestratorState: "idle",
        pendingDecisions: 0,
        activeSessions: 0,
        completedSessions: 0,
        failedSessions: 0,
        recentEvents: [],
      });

      const events = createEventsView();

      const intake = createIntakeView({
        loadItems: () => listWorkItems(rootDir),
        onSkip: (item) => {
          try {
            skipWorkItem(rootDir, item.id);
          } catch {
            // best-effort from TUI
          }
        },
      });

      const pipeline = createPipelineView({
        loadState: () => {
          // Find most recent active work item to show its pipeline
          const active = listWorkItems(rootDir, {
            status: ["dispatching", "approved"] as WorkItemStatus[],
          });
          if (active.length === 0) return null;
          const ps = loadPipelineState(rootDir, active[0].id);
          if (!ps) return null;
          return {
            workItemTitle: active[0].title,
            currentStage: ps.currentStage,
            branch: ps.branch,
            prUrl: ps.prUrl,
          };
        },
      });

      const dispatch = createDispatchView({
        loadSessions: () =>
          listSessions(rootDir).map((s) => ({
            id: s.id,
            agent: s.agent,
            task: s.task,
            status: s.status,
            startedAt: s.startedAt,
            eventCount: s.eventCount,
          })),
      });

      const review = createReviewView({
        loadSessions: () =>
          listReviewSessions(rootDir).map((s) => ({
            id: s.id,
            timestamp: s.timestamp,
            findingCount: s.findingCount,
            mode: s.mode,
            durationMs: s.durationMs,
          })),
      });

      // Single cleanup path
      let cleaned = false;
      const cleanup = (): void => {
        if (cleaned) return;
        cleaned = true;
        app.stop();
        client.disconnect();
      };

      // Create app with all views
      const screen = createScreen();
      const app = createApp({
        screen,
        views: [dashboard, events, intake, pipeline, dispatch, review],
        projectName: cfg.project.name,
        onQuit: () => {
          cleanup();
          process.exit(0);
        },
      });

      client.onEvent((event) => app.handleEvent(event));
      await client.sendCommand("subscribe");

      app.start();

      process.on("SIGINT", cleanup);
      process.on("SIGTERM", cleanup);
    }),
  );
