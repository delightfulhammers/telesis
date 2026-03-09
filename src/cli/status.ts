import { Command } from "commander";
import { getStatus } from "../status/status.js";
import { projectRoot } from "./project-root.js";
import { handleAction } from "./handle-action.js";

const firstLine = (s: string): string => {
  const idx = s.indexOf("\n");
  return idx >= 0 ? s.slice(0, idx) : s;
};

const formatNumber = (n: number): string => n.toLocaleString("en-US");

const formatDate = (d: Date): string => {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export const statusCommand = new Command("status")
  .description("Print current project state")
  .action(
    handleAction(() => {
      const rootDir = projectRoot();
      const s = getStatus(rootDir);

      console.log(`Project:    ${s.projectName}`);
      console.log(`Status:     ${s.projectStatus}`);
      console.log(`ADRs:       ${s.adrCount}`);
      console.log(`TDDs:       ${s.tddCount}`);

      if (s.activeMilestone) {
        console.log(`Milestone:  ${firstLine(s.activeMilestone)}`);
      } else {
        console.log("Milestone:  (none)");
      }

      if (s.contextGeneratedAt) {
        console.log(
          `CLAUDE.md:  last generated ${formatDate(s.contextGeneratedAt)}`,
        );
      } else {
        console.log("CLAUDE.md:  not yet generated");
      }

      if (s.modelCallCount > 0) {
        console.log(
          `Tokens:     ${formatNumber(s.totalInputTokens)} in / ${formatNumber(s.totalOutputTokens)} out (${s.modelCallCount} call${s.modelCallCount === 1 ? "" : "s"})`,
        );
        if (s.estimatedCost !== null) {
          console.log(`Est. cost:  $${s.estimatedCost.toFixed(4)}`);
        }
      }
    }),
  );
