/**
 * Live validation script for document generation quality.
 *
 * Generates documents from a recorded interview fixture using live model calls,
 * then runs the eval suite and reports scores.
 *
 * Usage: pnpm tsx tests/live/validate-generation.ts [fixture-path]
 *
 * Default fixture: tests/live/fixtures/tic-tac-toe-interview.json
 */
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createModelClient } from "../../src/agent/model/client.js";
import { createTelemetryLogger } from "../../src/agent/telemetry/logger.js";
import { generateDocuments } from "../../src/agent/generate/generator.js";
import { evaluate } from "../../src/eval/runner.js";
import { formatReport } from "../../src/eval/format.js";
import type { InterviewState } from "../../src/agent/interview/state.js";

const DEFAULT_FIXTURE = "tests/live/fixtures/tic-tac-toe-interview.json";

const loadFixture = (path: string): InterviewState => {
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as InterviewState;
};

const main = async (): Promise<void> => {
  const fixturePath = resolve(process.argv[2] ?? DEFAULT_FIXTURE);
  console.log(`Loading fixture: ${fixturePath}\n`);

  const state = loadFixture(fixturePath);
  console.log(
    `Interview: ${state.turns.length} turns, ${state.turnCount} user messages\n`,
  );

  const workDir = mkdtempSync(join(tmpdir(), "telesis-validation-"));
  mkdirSync(join(workDir, ".telesis"), { recursive: true });
  console.log(`Working directory: ${workDir}\n`);

  const sdk = new Anthropic();
  const telemetry = createTelemetryLogger(workDir);
  const client = createModelClient({
    sdk,
    telemetry,
    sessionId: `validation-${randomUUID()}`,
    component: "validation",
  });

  console.log("Generating documents (live model calls)...\n");

  const docs = await generateDocuments({
    client,
    state,
    rootDir: workDir,
    onDocGenerated: (docType, content) => {
      const lines = content.split("\n").length;
      console.log(`  ✓ ${docType.toUpperCase()} generated (${lines} lines)`);
    },
  });

  console.log("\nRunning evaluation suite...\n");

  const report = evaluate({
    interviewState: state,
    generatedDocs: {
      vision: docs.vision ?? "",
      prd: docs.prd ?? "",
      architecture: docs.architecture ?? "",
      milestones: docs.milestones ?? "",
    },
  });

  console.log(formatReport(report));

  // Also output JSON for programmatic comparison
  console.log("\n--- JSON Report ---\n");
  console.log(JSON.stringify(report, null, 2));
};

main().catch((err) => {
  console.error("Validation failed:", err);
  process.exit(1);
});
