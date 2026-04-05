import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveJiraAuth, buildAuthHeader } from "./auth.js";

describe("resolveJiraAuth", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.JIRA_TOKEN;
    delete process.env.JIRA_EMAIL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns null when JIRA_TOKEN is not set", () => {
    expect(resolveJiraAuth()).toBeNull();
  });

  it("returns bearer auth when JIRA_TOKEN is set without JIRA_EMAIL", () => {
    process.env.JIRA_TOKEN = "pat-abc123";
    const auth = resolveJiraAuth();
    expect(auth).toEqual({ mode: "bearer", token: "pat-abc123" });
  });

  it("returns basic auth when both JIRA_TOKEN and JIRA_EMAIL are set", () => {
    process.env.JIRA_TOKEN = "api-token-xyz";
    process.env.JIRA_EMAIL = "user@company.com";
    const auth = resolveJiraAuth();
    expect(auth).toEqual({
      mode: "basic",
      token: "api-token-xyz",
      email: "user@company.com",
    });
  });

  it("returns null when JIRA_TOKEN is too short", () => {
    process.env.JIRA_TOKEN = "short";
    expect(resolveJiraAuth()).toBeNull();
  });

  it("returns null when JIRA_TOKEN contains control characters", () => {
    process.env.JIRA_TOKEN = "token-with-\nnewline-in-it!!";
    expect(resolveJiraAuth()).toBeNull();
  });

  it("returns null when JIRA_EMAIL is invalid", () => {
    process.env.JIRA_TOKEN = "valid-token-that-is-long-enough";
    process.env.JIRA_EMAIL = "not-an-email";
    expect(resolveJiraAuth()).toBeNull();
  });
});

describe("buildAuthHeader", () => {
  it("builds Bearer header for server PAT auth", () => {
    const header = buildAuthHeader({ mode: "bearer", token: "pat-abc123" });
    expect(header).toBe("Bearer pat-abc123");
  });

  it("builds Basic header for cloud auth with email + token", () => {
    const header = buildAuthHeader({
      mode: "basic",
      token: "api-token-xyz",
      email: "user@company.com",
    });
    const expected = Buffer.from("user@company.com:api-token-xyz").toString(
      "base64",
    );
    expect(header).toBe(`Basic ${expected}`);
  });

  it("falls back to Bearer when basic mode has no email", () => {
    const header = buildAuthHeader({ mode: "basic", token: "tok" });
    expect(header).toBe("Bearer tok");
  });
});
