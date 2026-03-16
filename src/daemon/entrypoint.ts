import { resolve } from "node:path";
import { createBus } from "./bus.js";
import { startWatcher } from "./watcher.js";
import { writePid, removePid } from "./pid.js";
import { startSocketServer } from "./socket.js";
import {
  createEvent,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_IGNORE_PATTERNS,
  type DaemonConfig,
} from "./types.js";
import {
  startOrchestrator,
  stopOrchestrator,
} from "../orchestrator/integration.js";
import { checkForUpdate } from "../update/update.js";
import { notify } from "../orchestrator/notify.js";

/** Run the daemon main loop — this is the __run entrypoint */
export const runDaemon = async (
  rootDir: string,
  config: DaemonConfig = {},
  version: string = "0.0.0",
): Promise<void> => {
  const resolvedRoot = resolve(rootDir);
  const startTime = Date.now();
  let eventCount = 0;
  let shuttingDown = false;

  const bus = createBus();

  // Count all events for status reporting (includes lifecycle events)
  bus.subscribe(() => {
    eventCount++;
  });

  // Start orchestrator (subscribes to bus, loads/creates persisted state)
  const orchestrator = startOrchestrator(resolvedRoot, bus);

  // Merge ignore patterns
  const ignorePatterns = [
    ...DEFAULT_IGNORE_PATTERNS,
    ...(config.watch?.ignore ?? []),
  ];

  // Start filesystem watcher
  const watcher = startWatcher(resolvedRoot, bus, ignorePatterns);

  // Status provider for socket server
  const getStatus = () => ({
    pid: process.pid,
    uptimeMs: Date.now() - startTime,
    eventCount,
    clientCount: socketServer.clientCount(),
  });

  // Shutdown resolves the main loop promise
  let resolveMain: (() => void) | null = null;

  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    bus.publish(createEvent("daemon:stopping", {}));

    // Stop orchestrator (persists final state)
    stopOrchestrator(orchestrator);

    // Close watcher
    watcher.close();

    // Broadcast stopped and close socket
    bus.publish(createEvent("daemon:stopped", {}));

    // Give broadcasts a tick to flush
    await new Promise((r) => setTimeout(r, 50));

    await socketServer.close();
    removePid(resolvedRoot);
    bus.dispose();

    if (resolveMain) resolveMain();
  };

  // Start socket server
  const socketServer = await startSocketServer(
    resolvedRoot,
    bus,
    getStatus,
    () => {
      shutdown().catch((err) => console.error("[daemon] stop error:", err));
    },
  );

  // Subscribe socket server to broadcast all events
  bus.subscribe((event) => {
    socketServer.broadcast(event);
  });

  // Write PID file
  writePid(resolvedRoot);

  // Signal handlers — use once to prevent accumulation, catch to surface errors
  const onSignal = () => {
    shutdown().catch((err) => console.error("[daemon] shutdown error:", err));
  };
  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);

  // Heartbeat timer
  const heartbeatMs =
    config.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  const heartbeatTimer = setInterval(() => {
    bus.publish(
      createEvent("daemon:heartbeat", {
        uptimeMs: Date.now() - startTime,
        eventCount,
      }),
    );
  }, heartbeatMs);
  heartbeatTimer.unref();

  // Daily update check — empty init so the first heartbeat triggers a check
  let lastCheckDate = "";
  const dailyUpdateCheck = async (): Promise<void> => {
    const today = new Date().toDateString();
    if (today === lastCheckDate) return;

    try {
      const result = await checkForUpdate();
      // Only advance the date after a successful check —
      // transient failures retry on the next heartbeat
      lastCheckDate = today;
      if (result.updateAvailable) {
        notify(
          "Telesis update available",
          `v${result.currentVersion} → v${result.latestVersion} — run: telesis update`,
        );
      }
    } catch {
      // best-effort — don't crash daemon on update check failure
    }
  };
  const updateCheckTimer = setInterval(dailyUpdateCheck, heartbeatMs);
  updateCheckTimer.unref();

  // Emit started event
  bus.publish(
    createEvent("daemon:started", {
      pid: process.pid,
      rootDir: resolvedRoot,
      version,
    }),
  );

  // Keep the process alive until shutdown
  await new Promise<void>((resolve) => {
    resolveMain = resolve;
  });
};
