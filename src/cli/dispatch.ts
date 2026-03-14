import { Command } from "commander";
import { randomUUID } from "node:crypto";
import { projectRoot } from "./project-root.js";
import { handleAction } from "./handle-action.js";
import {
  loadRawConfig,
  parseDispatchConfig,
  parseOversightConfig,
} from "../config/config.js";
import { createAcpxAdapter } from "../dispatch/acpx-adapter.js";
import { dispatch } from "../dispatch/dispatcher.js";
import {
  listSessions,
  loadSessionMeta,
  loadSessionEvents,
} from "../dispatch/store.js";
import { formatSessionList, formatSessionDetail } from "../dispatch/format.js";
import { reconstructSessionText } from "../dispatch/reconstruct.js";
import { createEventRenderer } from "../daemon/tui.js";
import type { TelesisDaemonEvent } from "../daemon/types.js";
import { setupOversight } from "../oversight/setup.js";

const runCommand = new Command("run")
  .description("Dispatch a coding agent with a task")
  .argument("<task>", "Task description for the agent")
  .option("--agent <name>", "Agent to use (claude, codex, gemini, etc.)")
  .option("--no-oversight", "Disable oversight observers")
  .action(
    handleAction(
      async (task: string, opts: { agent?: string; oversight: boolean }) => {
        const rootDir = projectRoot();
        const rawConfig = loadRawConfig(rootDir);
        const config = parseDispatchConfig(rawConfig);
        const oversightConfig = parseOversightConfig(rawConfig);

        const agent = opts.agent ?? config.defaultAgent ?? "claude";
        const adapter = createAcpxAdapter({
          acpxPath: config.acpxPath,
        });

        // Generate session ID upfront so oversight can reference it
        const sessionId = randomUUID();

        // Try to connect to daemon for event publishing
        let disconnectDaemon: (() => void) | undefined;

        const renderer = createEventRenderer();
        let onEvent: (event: TelesisDaemonEvent) => void = renderer;
        try {
          const { connect } = await import("../daemon/client.js");
          const client = await connect(rootDir);
          disconnectDaemon = () => client.disconnect();
        } catch {
          // Daemon unavailable — renderer-only mode
        }

        // Set up oversight orchestrator if enabled
        const oversight = setupOversight({
          rootDir,
          sessionId,
          oversightConfig,
          oversightEnabled: opts.oversight !== false,
          onEvent,
          adapter,
          agent,
        });

        if (oversight) {
          onEvent = oversight.onEvent;
        }

        try {
          const result = await dispatch(
            {
              rootDir,
              adapter,
              onEvent,
              maxConcurrent: config.maxConcurrent,
              sessionId,
            },
            agent,
            task,
          );

          // Drain oversight observers after dispatch completes
          if (oversight) {
            const summary = await oversight.orchestrator.drain();
            if (summary.findingCount > 0 || summary.noteCount > 0) {
              console.log(
                `Oversight: ${summary.findingCount} finding(s), ${summary.noteCount} note(s) generated`,
              );
            }
            if (summary.intervened) {
              console.log("Oversight: session was cancelled by an observer");
            }
          }

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
      },
    ),
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
  .option(
    "--text",
    "Reconstruct and display full agent narrative from session events",
  )
  .action(
    handleAction((sessionId: string, opts: { text?: boolean }) => {
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

      if (opts.text) {
        if (events.length === 0) {
          console.log(`No events found for session ${meta.id}`);
          return;
        }

        const text = reconstructSessionText(events);
        if (text.length === 0) {
          console.log(`No output events in session ${meta.id}`);
          return;
        }

        console.log(text);
        return;
      }

      console.log(formatSessionDetail(meta, events));
    }),
  );

export const dispatchCommand = new Command("dispatch")
  .description("Dispatch coding agents via ACP")
  .addCommand(runCommand)
  .addCommand(listCommand)
  .addCommand(showCommand);
