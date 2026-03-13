import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../test-utils.js";
import {
  captureRef,
  diffSinceRef,
  summarizeSessionEvents,
} from "./diff-capture.js";

const makeTempDir = useTempDir("diff-capture");

/** Initialize a git repo with an initial commit */
const initGitRepo = (dir: string): void => {
  execFileSync("git", ["init"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  writeFileSync(join(dir, "README.md"), "# Test\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: dir });
};

describe("captureRef", () => {
  it("returns a 40-char hex sha", () => {
    const dir = makeTempDir();
    initGitRepo(dir);

    const ref = captureRef(dir);
    expect(ref).toMatch(/^[a-f0-9]{40}$/);
  });
});

describe("diffSinceRef", () => {
  it("returns empty string when no changes", () => {
    const dir = makeTempDir();
    initGitRepo(dir);

    const ref = captureRef(dir);
    const diff = diffSinceRef(dir, ref);
    expect(diff).toBe("");
  });

  it("returns diff of committed changes since ref", () => {
    const dir = makeTempDir();
    initGitRepo(dir);

    const ref = captureRef(dir);

    writeFileSync(join(dir, "new-file.ts"), "export const x = 1;\n");
    execFileSync("git", ["add", "."], { cwd: dir });
    execFileSync("git", ["commit", "-m", "add file"], { cwd: dir });

    const diff = diffSinceRef(dir, ref);
    expect(diff).toContain("new-file.ts");
    expect(diff).toContain("export const x = 1;");
  });

  it("rejects invalid ref format", () => {
    const dir = makeTempDir();
    initGitRepo(dir);

    expect(() => diffSinceRef(dir, "not-a-sha")).toThrow(/invalid ref/);
    expect(() => diffSinceRef(dir, "--option")).toThrow(/invalid ref/);
  });

  it("truncates large diffs", () => {
    const dir = makeTempDir();
    initGitRepo(dir);

    const ref = captureRef(dir);

    // Create a large file that generates a big diff
    const bigContent = "x".repeat(250_000) + "\n";
    writeFileSync(join(dir, "big.txt"), bigContent);
    execFileSync("git", ["add", "."], { cwd: dir });
    execFileSync("git", ["commit", "-m", "big file"], { cwd: dir });

    const diff = diffSinceRef(dir, ref);
    expect(diff).toContain("[...diff truncated at 200,000 characters]");
  });
});

describe("summarizeSessionEvents", () => {
  it("returns empty string when no session found", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".telesis", "sessions"), { recursive: true });

    const summary = summarizeSessionEvents(dir, "nonexistent");
    expect(summary).toBe("");
  });

  it("extracts output and tool_call events", () => {
    const dir = makeTempDir();
    const sessionsDir = join(dir, ".telesis", "sessions");
    mkdirSync(sessionsDir, { recursive: true });

    const sessionId = "test-session-001";
    writeFileSync(
      join(sessionsDir, `${sessionId}.meta.json`),
      JSON.stringify({
        id: sessionId,
        agent: "claude",
        task: "test",
        status: "completed",
        startedAt: new Date().toISOString(),
        eventCount: 3,
      }),
    );

    const events = [
      {
        eventVersion: 1,
        sessionId,
        requestId: "r1",
        seq: 1,
        stream: "main",
        type: "thinking",
        text: "thinking...",
      },
      {
        eventVersion: 1,
        sessionId,
        requestId: "r1",
        seq: 2,
        stream: "main",
        type: "output",
        text: "Created file foo.ts",
      },
      {
        eventVersion: 1,
        sessionId,
        requestId: "r1",
        seq: 3,
        stream: "main",
        type: "tool_call",
        tool: "write_file",
      },
    ];

    const eventsFile = join(sessionsDir, `${sessionId}.events.jsonl`);
    for (const event of events) {
      appendFileSync(eventsFile, JSON.stringify(event) + "\n");
    }

    const summary = summarizeSessionEvents(dir, sessionId);
    expect(summary).toContain("Created file foo.ts");
    expect(summary).toContain("[tool: write_file]");
    expect(summary).not.toContain("thinking...");
  });

  it("truncates long summaries", () => {
    const dir = makeTempDir();
    const sessionsDir = join(dir, ".telesis", "sessions");
    mkdirSync(sessionsDir, { recursive: true });

    const sessionId = "test-session-002";
    writeFileSync(
      join(sessionsDir, `${sessionId}.meta.json`),
      JSON.stringify({
        id: sessionId,
        agent: "claude",
        task: "test",
        status: "completed",
        startedAt: new Date().toISOString(),
        eventCount: 1,
      }),
    );

    const longText = "a".repeat(100);
    const eventsFile = join(sessionsDir, `${sessionId}.events.jsonl`);
    appendFileSync(
      eventsFile,
      JSON.stringify({
        eventVersion: 1,
        sessionId,
        requestId: "r1",
        seq: 1,
        stream: "main",
        type: "output",
        text: longText,
      }) + "\n",
    );

    const summary = summarizeSessionEvents(dir, sessionId, 50);
    expect(summary).toContain("[...session summary truncated");
    expect(summary.length).toBeLessThan(200);
  });
});
