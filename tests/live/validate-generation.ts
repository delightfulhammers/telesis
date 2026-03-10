/**
 * Live validation script for document generation quality.
 *
 * Generates documents from a recorded interview fixture using live model calls,
 * then runs the eval suite and reports scores.
 *
 * Usage: npx tsx tests/live/validate-generation.ts [fixture-path]
 *
 * Default fixture: tests/live/fixtures/tic-tac-toe-interview.json
 */
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createModelClient } from "../../src/agent/model/client.js";
import { createTelemetryLogger } from "../../src/agent/telemetry/logger.js";
import { generateDocuments } from "../../src/agent/generate/generator.js";
import { evaluate } from "../../src/eval/runner.js";
import { formatReport } from "../../src/eval/format.js";
import type { InterviewState, Turn } from "../../src/agent/interview/state.js";

const DEFAULT_FIXTURE = "tests/live/fixtures/tic-tac-toe-interview.json";

const isValidTurn = (val: unknown): val is Turn => {
  if (!val || typeof val !== "object") return false;
  const obj = val as Record<string, unknown>;
  return (
    (obj.role === "user" || obj.role === "assistant") &&
    typeof obj.content === "string"
  );
};

const validateFixture = (raw: unknown, path: string): InterviewState => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Invalid fixture at ${path}: not an object`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.sessionId !== "string") {
    throw new Error(`Invalid fixture at ${path}: missing sessionId`);
  }
  if (typeof obj.complete !== "boolean") {
    throw new Error(`Invalid fixture at ${path}: missing or invalid complete`);
  }
  if (typeof obj.turnCount !== "number") {
    throw new Error(`Invalid fixture at ${path}: missing or invalid turnCount`);
  }
  if (!Array.isArray(obj.turns) || !obj.turns.every(isValidTurn)) {
    throw new Error(`Invalid fixture at ${path}: invalid turns array`);
  }
  return raw as InterviewState;
};

const loadFixture = (path: string): InterviewState => {
  const raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  return validateFixture(raw, path);
};

const main = async (): Promise<void> => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY environment variable is required");
    process.exit(1);
  }

  const fixturePath = resolve(process.argv[2] ?? DEFAULT_FIXTURE);
  console.log(`Loading fixture: ${fixturePath}\n`);

  const state = loadFixture(fixturePath);
  console.log(
    `Interview: ${state.turns.length} turns, ${state.turnCount} user messages\n`,
  );

  const workDir = mkdtempSync(join(tmpdir(), "telesis-validation-"));
  mkdirSync(join(workDir, ".telesis"), { recursive: true });
  console.log(`Working directory: ${workDir}\n`);

  try {
    const sdk = new Anthropic({ apiKey });
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
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
};

main().catch((err) => {
  console.error("Validation failed:", err);
  process.exit(1);
});
