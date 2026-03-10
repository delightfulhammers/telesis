import { Command } from "commander";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadState } from "../agent/interview/state.js";
import { DOCUMENT_PATHS } from "../agent/generate/types.js";
import type { GeneratedDocs } from "../agent/generate/types.js";
import { evaluate } from "../eval/runner.js";
import { formatReport } from "../eval/format.js";
import { handleAction } from "./handle-action.js";
import { projectRoot } from "./project-root.js";

const loadGeneratedDocs = (rootDir: string): Required<GeneratedDocs> => {
  const load = (relPath: string): string => {
    const fullPath = join(rootDir, relPath);
    if (!existsSync(fullPath)) return "";
    return readFileSync(fullPath, "utf-8");
  };

  return {
    vision: load(DOCUMENT_PATHS.vision),
    prd: load(DOCUMENT_PATHS.prd),
    architecture: load(DOCUMENT_PATHS.architecture),
    milestones: load(DOCUMENT_PATHS.milestones),
  };
};

export const evalCommand = new Command("eval")
  .description("Evaluate quality of generated project documents")
  .option("--json", "Output report as JSON")
  .action(
    handleAction(async (opts: { json?: boolean }) => {
      const rootDir = resolve(projectRoot());

      const interviewState = await loadState(rootDir);
      if (!interviewState) {
        throw new Error(
          "No interview state found. Run `telesis init` first, then evaluate.",
        );
      }

      const generatedDocs = loadGeneratedDocs(rootDir);

      const allDocKeys = Object.keys(DOCUMENT_PATHS);
      const missingDocs = allDocKeys
        .filter((key) => !generatedDocs[key as keyof GeneratedDocs])
        .map((key) => DOCUMENT_PATHS[key as keyof typeof DOCUMENT_PATHS]);

      if (missingDocs.length === allDocKeys.length) {
        throw new Error(
          `No generated documents found. Run \`telesis init\` first.`,
        );
      }

      if (missingDocs.length > 0) {
        console.error(
          `Warning: ${missingDocs.length} document(s) missing — report will be partial: ${missingDocs.join(", ")}`,
        );
      }

      const report = evaluate({ interviewState, generatedDocs });

      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatReport(report));
      }
    }),
  );
