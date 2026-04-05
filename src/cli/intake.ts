import { Command } from "commander";
import { randomUUID } from "node:crypto";
import { projectRoot } from "./project-root.js";
import { handleAction } from "./handle-action.js";
import {
  loadRawConfig,
  parseDispatchConfig,
  parseIntakeConfig,
  parsePlannerConfig,
  resolveGitHubApiBase,
} from "../config/config.js";
import {
  extractRepoContext,
  extractDomainFromApiUrl,
  resolveGitHubToken,
} from "../github/environment.js";
import { createGitHubSource } from "../intake/github-source.js";
import { createJiraSource } from "../intake/jira-source.js";
import { resolveJiraAuth } from "../jira/auth.js";
import { syncFromSource } from "../intake/sync.js";
import { listWorkItems, loadWorkItem } from "../intake/store.js";
import { updateWorkItem } from "../intake/store.js";
import type { WorkItemStatus } from "../intake/types.js";
import { approveWorkItem, skipWorkItem } from "../intake/approve.js";
import { formatWorkItemList, formatWorkItemDetail } from "../intake/format.js";
import { createAcpxAdapter } from "../dispatch/acpx-adapter.js";
import { createEventRenderer } from "../daemon/tui.js";
import { createSdk, createModelClient } from "../agent/model/client.js";
import { createTelemetryLogger } from "../agent/telemetry/logger.js";
import { createPlanFromWorkItem } from "../plan/create.js";
import { formatPlanDetail } from "../plan/format.js";

const githubCommand = new Command("github")
  .description("Import issues from GitHub")
  .action(
    handleAction(async () => {
      const rootDir = projectRoot();
      const rawConfig = loadRawConfig(rootDir);
      const intakeConfig = parseIntakeConfig(rawConfig);

      const token = resolveGitHubToken();
      if (!token) {
        throw new Error(
          "GitHub token required. Set GITHUB_TOKEN or authenticate with `gh auth login`.",
        );
      }

      const apiBase = resolveGitHubApiBase(rawConfig);
      const domain = extractDomainFromApiUrl(apiBase);
      const repoCtx = extractRepoContext(domain);
      if (!repoCtx) {
        throw new Error(
          "Could not detect GitHub repo. Set GITHUB_REPOSITORY or ensure a GitHub remote exists.",
        );
      }

      const source = createGitHubSource(
        intakeConfig.github,
        repoCtx.owner,
        repoCtx.repo,
        token,
        apiBase,
      );

      const renderer = createEventRenderer();
      const result = await syncFromSource(rootDir, source, renderer);

      console.log(
        `Imported ${result.imported} issue(s), ${result.skippedDuplicate} duplicate(s) skipped`,
      );

      if (result.errors.length > 0) {
        for (const err of result.errors) {
          console.error(`  ${err}`);
        }
        process.exitCode = 1;
      }
    }),
  );

const jiraCommand = new Command("jira")
  .description("Import issues from Jira")
  .action(
    handleAction(async () => {
      const rootDir = projectRoot();
      const rawConfig = loadRawConfig(rootDir);
      const intakeConfig = parseIntakeConfig(rawConfig);

      if (!intakeConfig.jira?.baseUrl) {
        throw new Error(
          "Jira base URL not configured. Add intake.jira.baseUrl to .telesis/config.yml",
        );
      }

      const auth = resolveJiraAuth();
      if (!auth) {
        throw new Error(
          "JIRA_TOKEN not set. Set JIRA_TOKEN (and JIRA_EMAIL for Jira Cloud).",
        );
      }

      const source = createJiraSource(intakeConfig.jira, auth);

      const renderer = createEventRenderer();
      const result = await syncFromSource(rootDir, source, renderer);

      console.log(
        `Imported ${result.imported} issue(s), ${result.skippedDuplicate} duplicate(s) skipped`,
      );

      if (result.errors.length > 0) {
        for (const err of result.errors) {
          console.error(`  ${err}`);
        }
        process.exitCode = 1;
      }
    }),
  );

const listCommand = new Command("list")
  .description("List work items")
  .option("--all", "Show all statuses (default: active only)")
  .option("--json", "Output as JSON")
  .action(
    handleAction((opts: { all?: boolean; json?: boolean }) => {
      const rootDir = projectRoot();
      const filter = opts.all
        ? undefined
        : {
            status: ["pending", "approved", "dispatching"] as WorkItemStatus[],
          };
      const items = listWorkItems(rootDir, filter);

      if (opts.json) {
        console.log(JSON.stringify(items, null, 2));
        return;
      }

      console.log(formatWorkItemList(items));
    }),
  );

const showCommand = new Command("show")
  .description("Show work item details")
  .argument("<id>", "Work item ID or prefix")
  .action(
    handleAction((id: string) => {
      const rootDir = projectRoot();
      const item = loadWorkItem(rootDir, id);

      if (!item) {
        console.error(`No work item matching "${id}"`);
        process.exitCode = 1;
        return;
      }

      console.log(formatWorkItemDetail(item));
    }),
  );

const approveCommand = new Command("approve")
  .description("Approve a work item and dispatch to a coding agent")
  .argument("<id>", "Work item ID or prefix")
  .option("--agent <name>", "Agent to use (claude, codex, gemini, etc.)")
  .option("--plan", "Create a plan instead of dispatching directly")
  .action(
    handleAction(
      async (id: string, opts: { agent?: string; plan?: boolean }) => {
        const rootDir = projectRoot();
        const rawConfig = loadRawConfig(rootDir);

        if (opts.plan) {
          // Plan mode: approve work item and create a draft plan
          const workItem = loadWorkItem(rootDir, id);
          if (!workItem) {
            console.error(`No work item matching "${id}"`);
            process.exitCode = 1;
            return;
          }

          if (workItem.status !== "pending") {
            console.error(
              `Work item ${workItem.id.slice(0, 8)} has status "${workItem.status}", expected "pending"`,
            );
            process.exitCode = 1;
            return;
          }

          // Transition to approved
          const approved = {
            ...workItem,
            status: "approved" as const,
            approvedAt: new Date().toISOString(),
          };
          updateWorkItem(rootDir, approved);

          const plannerConfig = parsePlannerConfig(rawConfig);
          const sessionId = randomUUID();
          const telemetry = createTelemetryLogger(rootDir);
          const client = createModelClient({
            sdk: createSdk(),
            telemetry,
            sessionId,
            component: "planner",
            defaultModel: plannerConfig.model,
          });

          console.log(
            `Planning work item ${workItem.id.slice(0, 8)}: ${workItem.title}`,
          );

          let plan;
          try {
            plan = await createPlanFromWorkItem(
              client,
              rootDir,
              workItem,
              plannerConfig.model,
              plannerConfig.maxTasks,
            );
          } catch (err) {
            // Rollback: restore work item to pending so user can retry
            try {
              updateWorkItem(rootDir, {
                ...workItem,
                status: "pending" as const,
              });
            } catch (rollbackErr) {
              process.stderr.write(
                `[telesis] Warning: failed to rollback work item status: ${rollbackErr}\n`,
              );
            }
            throw err;
          }

          console.log("");
          console.log(formatPlanDetail(plan));
          console.log("");
          console.log(
            `Plan ${plan.id.slice(0, 8)} created as draft. Use \`telesis plan approve ${plan.id.slice(0, 8)}\` to approve.`,
          );
          return;
        }

        // Standard mode: approve and dispatch directly
        const config = parseDispatchConfig(rawConfig);

        const agent = opts.agent ?? config.defaultAgent ?? "claude";
        const adapter = createAcpxAdapter({
          acpxPath: config.acpxPath,
        });

        const renderer = createEventRenderer();

        const result = await approveWorkItem(
          rootDir,
          id,
          {
            rootDir,
            adapter,
            onEvent: renderer,
            maxConcurrent: config.maxConcurrent,
          },
          agent,
          renderer,
        );

        console.log("");
        if (result.status === "completed") {
          console.log(
            `Work item ${result.id.slice(0, 8)} completed — session ${result.sessionId?.slice(0, 8)}`,
          );
        } else {
          console.log(
            `Work item ${result.id.slice(0, 8)} failed — ${result.error ?? "unknown error"}`,
          );
          process.exitCode = 1;
        }
      },
    ),
  );

const skipCommand = new Command("skip")
  .description("Skip a work item")
  .argument("<id>", "Work item ID or prefix")
  .action(
    handleAction((id: string) => {
      const rootDir = projectRoot();
      const result = skipWorkItem(rootDir, id);
      console.log(`Work item ${result.id.slice(0, 8)} marked as skipped`);
    }),
  );

export const intakeCommand = new Command("intake")
  .description("Import and manage work items from external sources")
  .addCommand(githubCommand)
  .addCommand(jiraCommand)
  .addCommand(listCommand)
  .addCommand(showCommand)
  .addCommand(approveCommand)
  .addCommand(skipCommand);
