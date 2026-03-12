import { resolve, isAbsolute, basename } from "node:path";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { handleAction } from "./handle-action.js";
import { projectRoot } from "./project-root.js";
import { startDaemon, stopDaemon, daemonStatus } from "../daemon/lifecycle.js";
import { runDaemon } from "../daemon/entrypoint.js";
import { parseDaemonConfig } from "../config/config.js";
import {
  generateLaunchAgentPlist,
  generateSystemdUnit,
  launchAgentFilename,
  launchAgentDir,
  systemdUnitFilename,
  systemdUnitDir,
} from "../daemon/supervision.js";
import { connect } from "../daemon/client.js";
import { createEventRenderer } from "../daemon/tui.js";

const startCommand = new Command("start")
  .description("Start the Telesis daemon")
  .action(
    handleAction(async () => {
      const rootDir = projectRoot();
      const result = await startDaemon(rootDir);

      if (result.alreadyRunning) {
        console.log(`Daemon already running (PID ${result.pid})`);
      } else {
        console.log(`Daemon started (PID ${result.pid})`);
      }
    }),
  );

const stopCommand = new Command("stop")
  .description("Stop the Telesis daemon")
  .action(
    handleAction(async () => {
      const rootDir = projectRoot();
      const stopped = await stopDaemon(rootDir);

      if (stopped) {
        console.log("Daemon stopped");
      } else {
        console.log("Daemon is not running");
      }
    }),
  );

const statusCommand = new Command("status")
  .description("Show daemon status")
  .action(
    handleAction(async () => {
      const rootDir = projectRoot();
      const status = await daemonStatus(rootDir);

      if (!status.running) {
        console.log("Daemon is not running");
        return;
      }

      console.log(`Daemon running (PID ${status.pid})`);
      if (status.uptimeMs !== undefined) {
        const secs = Math.floor(status.uptimeMs / 1000);
        console.log(`  Uptime: ${secs}s`);
      }
      if (status.eventCount !== undefined) {
        console.log(`  Events: ${status.eventCount}`);
      }
      if (status.clientCount !== undefined) {
        console.log(`  Clients: ${status.clientCount}`);
      }
    }),
  );

const installCommand = new Command("install")
  .description("Configure OS-level supervision for the daemon")
  .action(
    handleAction(() => {
      const rootDir = resolve(projectRoot());
      const platform = process.platform;

      // Supervision files require an absolute binary path
      const argv0 = process.argv[0];
      if (!isAbsolute(argv0) || basename(argv0) !== "telesis") {
        throw new Error(
          "could not determine binary path — run from the compiled telesis binary",
        );
      }
      const binaryPath = argv0;

      if (platform === "darwin") {
        const plist = generateLaunchAgentPlist(rootDir, binaryPath);
        const dir = launchAgentDir();
        const filename = launchAgentFilename(rootDir);
        const dest = join(dir, filename);

        mkdirSync(dir, { recursive: true });
        writeFileSync(dest, plist);
        console.log(`LaunchAgent written to ${dest}`);
        console.log(`Load with: launchctl load ${dest}`);
      } else if (platform === "linux") {
        const unit = generateSystemdUnit(rootDir, binaryPath);
        const dir = systemdUnitDir();
        const filename = systemdUnitFilename(rootDir);
        const dest = join(dir, filename);

        mkdirSync(dir, { recursive: true });
        writeFileSync(dest, unit);
        console.log(`Systemd unit written to ${dest}`);
        console.log(`Enable with: systemctl --user enable --now ${filename}`);
      } else {
        throw new Error(
          `unsupported platform: ${platform} (supported: darwin, linux)`,
        );
      }
    }),
  );

const tuiCommand = new Command("tui")
  .description("Stream live daemon events to the terminal")
  .action(
    handleAction(async () => {
      const rootDir = projectRoot();
      const client = await connect(rootDir);
      const render = createEventRenderer();

      client.onEvent(render);
      await client.sendCommand("subscribe");

      console.error("Connected to daemon. Press Ctrl+C to disconnect.");

      // Keep alive until Ctrl+C
      await new Promise<void>((resolve) => {
        process.on("SIGINT", () => {
          client.disconnect();
          resolve();
        });
      });
    }),
  );

const runCommand = new Command("__run")
  .description("Internal: run daemon in foreground")
  .action(
    handleAction(async () => {
      const rootDir = projectRoot();
      const config = parseDaemonConfig(rootDir);
      const pkgPath = join(rootDir, "package.json");
      let version = "0.0.0";
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        if (typeof pkg.version === "string") version = pkg.version;
      } catch {
        // fall back to default
      }
      await runDaemon(rootDir, config, version);
      // Daemon has shut down cleanly — exit the process
      process.exitCode = 0;
    }),
  );

export const daemonCommand = new Command("daemon")
  .description("Manage the Telesis daemon")
  .addCommand(startCommand)
  .addCommand(stopCommand)
  .addCommand(statusCommand)
  .addCommand(installCommand)
  .addCommand(tuiCommand)
  .addCommand(runCommand, { hidden: true });
