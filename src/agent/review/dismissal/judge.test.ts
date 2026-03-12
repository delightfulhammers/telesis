import { describe, it, expect, vi } from "vitest";
import { filterWithJudge } from "./judge.js";
import type { ReviewFinding } from "../types.js";
import type { Dismissal } from "./types.js";
import type { ModelClient } from "../../model/client.js";

const makeFinding = (
  overrides: Partial<ReviewFinding> = {},
): ReviewFinding => ({
  id: "finding-001",
  sessionId: "session-001",
  severity: "medium",
  category: "bug",
  path: "src/foo.ts",
  startLine: 42,
  description: "Missing null check on user input",
  suggestion: "Add a null guard",
  confidence: 80,
  ...overrides,
});

const makeDismissal = (overrides: Partial<Dismissal> = {}): Dismissal => ({
  id: "dismissal-001",
  findingId: "dismissed-finding-001",
  sessionId: "old-session",
  reason: "false-positive",
  timestamp: new Date().toISOString(),
  source: "cli",
  path: "src/foo.ts",
  severity: "medium",
  category: "bug",
  description: "Missing null check on user input",
  suggestion: "Add a null guard",
  startLine: 42,
  ...overrides,
});

const makeClient = (response: string): ModelClient => ({
  complete: vi.fn().mockResolvedValue({
    content: response,
    usage: { inputTokens: 100, outputTokens: 10 },
    durationMs: 50,
  }),
});

describe("filterWithJudge", () => {
  it("filters finding when model says YES", async () => {
    const findings = [
      makeFinding({
        id: "new-1",
        path: "src/foo.ts",
        category: "bug",
        description: "Input validation is absent for the user parameter",
      }),
    ];
    const dismissals = [
      makeDismissal({
        path: "src/foo.ts",
        category: "bug",
        description: "Missing null check on user input",
      }),
    ];
    const client = makeClient(
      "YES — same concern about missing input validation",
    );
    const result = await filterWithJudge(
      client,
      "claude-haiku-4-5-20251001",
      findings,
      dismissals,
    );
    expect(result.findings).toHaveLength(0);
    expect(result.filteredCount).toBe(1);
    expect(result.filteredIds).toContain("new-1");
  });

  it("keeps finding when model says NO", async () => {
    const findings = [
      makeFinding({
        id: "new-1",
        path: "src/foo.ts",
        category: "bug",
        description: "Array index out of bounds in loop",
      }),
    ];
    const dismissals = [
      makeDismissal({
        path: "src/foo.ts",
        category: "bug",
        description: "Missing null check on user input",
      }),
    ];
    const client = makeClient(
      "NO — different concern: array bounds vs null check",
    );
    const result = await filterWithJudge(
      client,
      "claude-haiku-4-5-20251001",
      findings,
      dismissals,
    );
    expect(result.findings).toHaveLength(1);
    expect(result.filteredCount).toBe(0);
  });

  it("does NOT call model for findings with no path+category overlap with dismissals", async () => {
    const findings = [
      makeFinding({
        id: "new-1",
        path: "src/bar.ts",
        category: "security",
        description: "SQL injection vulnerability",
      }),
    ];
    const dismissals = [
      makeDismissal({
        path: "src/foo.ts",
        category: "bug",
        description: "Missing null check on user input",
      }),
    ];
    const client = makeClient("YES");
    const result = await filterWithJudge(
      client,
      "claude-haiku-4-5-20251001",
      findings,
      dismissals,
    );
    expect(result.findings).toHaveLength(1);
    expect(result.filteredCount).toBe(0);
    expect(client.complete).not.toHaveBeenCalled();
  });

  it("handles model call failure gracefully (keeps finding)", async () => {
    const findings = [
      makeFinding({
        id: "new-1",
        path: "src/foo.ts",
        category: "bug",
        description: "Input not validated",
      }),
    ];
    const dismissals = [
      makeDismissal({
        path: "src/foo.ts",
        category: "bug",
        description: "Missing null check on user input",
      }),
    ];
    const client: ModelClient = {
      complete: vi.fn().mockRejectedValue(new Error("API error")),
    };
    const result = await filterWithJudge(
      client,
      "claude-haiku-4-5-20251001",
      findings,
      dismissals,
    );
    expect(result.findings).toHaveLength(1);
    expect(result.filteredCount).toBe(0);
  });

  it("returns all findings unchanged when dismissals list is empty", async () => {
    const findings = [makeFinding()];
    const client = makeClient("YES");
    const result = await filterWithJudge(
      client,
      "claude-haiku-4-5-20251001",
      findings,
      [],
    );
    expect(result.findings).toHaveLength(1);
    expect(client.complete).not.toHaveBeenCalled();
  });
});
