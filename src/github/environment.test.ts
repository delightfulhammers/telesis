import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../test-utils.js";
import { isGitHubActions, extractPRContext } from "./environment.js";

const makeTempDir = useTempDir("github-env");

describe("isGitHubActions", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns true when GITHUB_ACTIONS is 'true'", () => {
    process.env.GITHUB_ACTIONS = "true";
    expect(isGitHubActions()).toBe(true);
  });

  it("returns false when GITHUB_ACTIONS is not set", () => {
    delete process.env.GITHUB_ACTIONS;
    expect(isGitHubActions()).toBe(false);
  });

  it("returns false when GITHUB_ACTIONS is not 'true'", () => {
    process.env.GITHUB_ACTIONS = "false";
    expect(isGitHubActions()).toBe(false);
  });
});

describe("extractPRContext", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const writePREvent = (dir: string): string => {
    const eventPath = join(dir, "event.json");
    const payload = {
      pull_request: {
        number: 42,
        head: { sha: "abc123def456abc123def456abc123def456abc1" },
      },
      repository: { full_name: "delightfulhammers/telesis" },
    };
    writeFileSync(eventPath, JSON.stringify(payload));
    return eventPath;
  };

  it("extracts PR context from a valid pull_request event", () => {
    const dir = makeTempDir();
    const eventPath = writePREvent(dir);
    process.env.GITHUB_EVENT_PATH = eventPath;
    process.env.GITHUB_TOKEN = "ghp_test123";

    const ctx = extractPRContext();

    expect(ctx).toEqual({
      owner: "delightfulhammers",
      repo: "telesis",
      pullNumber: 42,
      commitSha: "abc123def456abc123def456abc123def456abc1",
      token: "ghp_test123",
    });
  });

  it("returns null when GITHUB_EVENT_PATH is not set", () => {
    delete process.env.GITHUB_EVENT_PATH;
    process.env.GITHUB_TOKEN = "ghp_test123";
    expect(extractPRContext()).toBeNull();
  });

  it("returns null when GITHUB_TOKEN is not set", () => {
    const dir = makeTempDir();
    process.env.GITHUB_EVENT_PATH = writePREvent(dir);
    delete process.env.GITHUB_TOKEN;
    expect(extractPRContext()).toBeNull();
  });

  it("returns null for non-PR events (push)", () => {
    const dir = makeTempDir();
    const eventPath = join(dir, "event.json");
    writeFileSync(
      eventPath,
      JSON.stringify({
        ref: "refs/heads/main",
        repository: { full_name: "delightfulhammers/telesis" },
      }),
    );
    process.env.GITHUB_EVENT_PATH = eventPath;
    process.env.GITHUB_TOKEN = "ghp_test123";

    expect(extractPRContext()).toBeNull();
  });

  it("returns null for schedule events", () => {
    const dir = makeTempDir();
    const eventPath = join(dir, "event.json");
    writeFileSync(eventPath, JSON.stringify({ schedule: "0 0 * * *" }));
    process.env.GITHUB_EVENT_PATH = eventPath;
    process.env.GITHUB_TOKEN = "ghp_test123";

    expect(extractPRContext()).toBeNull();
  });

  it("returns null when event file is unreadable", () => {
    process.env.GITHUB_EVENT_PATH = "/nonexistent/path/event.json";
    process.env.GITHUB_TOKEN = "ghp_test123";
    expect(extractPRContext()).toBeNull();
  });

  it("returns null when event file contains invalid JSON", () => {
    const dir = makeTempDir();
    const eventPath = join(dir, "event.json");
    writeFileSync(eventPath, "not json");
    process.env.GITHUB_EVENT_PATH = eventPath;
    process.env.GITHUB_TOKEN = "ghp_test123";

    expect(extractPRContext()).toBeNull();
  });
});
