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
import { getStatus } from "../status/status.js";
import { VERSION } from "../version.js";

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

      // Connect to daemon first — needed before creating app
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

      // Single cleanup path — guarded against double invocation
      let cleaned = false;
      const cleanup = (): void => {
        if (cleaned) return;
        cleaned = true;
        app.stop();
        client.disconnect();
      };

      // Create app
      const screen = createScreen();
      const app = createApp({
        screen,
        views: [dashboard, events],
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
