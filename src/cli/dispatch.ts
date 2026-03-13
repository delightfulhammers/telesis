import { Command } from "commander";
import { projectRoot } from "./project-root.js";
import { handleAction } from "./handle-action.js";
import { parseDispatchConfig } from "../config/config.js";
import { createAcpxAdapter } from "../dispatch/acpx-adapter.js";
import { dispatch } from "../dispatch/dispatcher.js";
import {
  listSessions,
  loadSessionMeta,
  loadSessionEvents,
} from "../dispatch/store.js";
import { formatSessionList, formatSessionDetail } from "../dispatch/format.js";
import { createEventRenderer } from "../daemon/tui.js";
import type { TelesisDaemonEvent } from "../daemon/types.js";

const runCommand = new Command("run")
  .description("Dispatch a coding agent with a task")
  .argument("<task>", "Task description for the agent")
  .option("--agent <name>", "Agent to use (claude, codex, gemini, etc.)")
  .action(
    handleAction(async (task: string, opts: { agent?: string }) => {
      const rootDir = projectRoot();
      const config = parseDispatchConfig(rootDir);

      const agent = opts.agent ?? config.defaultAgent ?? "claude";
      const adapter = createAcpxAdapter({
        acpxPath: config.acpxPath,
      });

      // Try to connect to daemon for event publishing
      let onEvent: ((event: TelesisDaemonEvent) => void) | undefined;
      let disconnectDaemon: (() => void) | undefined;

      try {
        const { connect } = await import("../daemon/client.js");
        const client = await connect(rootDir);
        const renderer = createEventRenderer();
        client.onEvent(renderer);
        onEvent = (event) => {
          // Also render locally since daemon may not echo back
          renderer(event);
        };
        disconnectDaemon = () => client.disconnect();
      } catch {
        // Daemon not running — stream events to stdout directly
        const renderer = createEventRenderer();
        onEvent = renderer;
      }

      try {
        const result = await dispatch(
          {
            rootDir,
            adapter,
            onEvent,
            maxConcurrent: config.maxConcurrent,
          },
          agent,
          task,
        );

        console.log("");
        if (result.status === "completed") {
          console.log(
            `Session ${result.sessionId.slice(0, 8)} completed — ${result.eventCount} events in ${Math.floor(result.durationMs / 1000)}s`,
          );
        } else {
          console.log(
            `Session ${result.sessionId.slice(0, 8)} failed — see \`telesis dispatch show ${result.sessionId.slice(0, 8)}\` for details`,
          );
          process.exitCode = 1;
        }
      } finally {
        disconnectDaemon?.();
      }
    }),
  );

const listCommand = new Command("list")
  .description("List dispatch sessions")
  .option("--json", "Output as JSON")
  .action(
    handleAction((opts: { json?: boolean }) => {
      const rootDir = projectRoot();
      const sessions = listSessions(rootDir);

      if (opts.json) {
        console.log(JSON.stringify(sessions, null, 2));
        return;
      }

      console.log(formatSessionList(sessions));
    }),
  );

const showCommand = new Command("show")
  .description("Show a dispatch session's event log")
  .argument("<session-id>", "Session ID or prefix")
  .action(
    handleAction((sessionId: string) => {
      const rootDir = projectRoot();

      const meta = loadSessionMeta(rootDir, sessionId);
      if (!meta) {
        console.error(`No session matching "${sessionId}"`);
        process.exitCode = 1;
        return;
      }

      const { items: events, invalidLineCount } = loadSessionEvents(
        rootDir,
        meta.id,
      );

      if (invalidLineCount > 0) {
        console.error(
          `Warning: ${invalidLineCount} malformed line(s) in event log were skipped.`,
        );
      }

      console.log(formatSessionDetail(meta, events));
    }),
  );

export const dispatchCommand = new Command("dispatch")
  .description("Dispatch coding agents via ACP")
  .addCommand(runCommand)
  .addCommand(listCommand)
  .addCommand(showCommand);
