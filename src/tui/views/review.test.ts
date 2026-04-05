import { describe, it, expect } from "vitest";
import { createReviewView } from "./review.js";
import type { ReviewInfo } from "./review.js";

const makeReview = (id: string, findings = 3): ReviewInfo => ({
  id,
  timestamp: new Date().toISOString(),
  findingCount: findings,
  mode: "personas",
  durationMs: 45000,
});

describe("createReviewView", () => {
  it("creates a view named Review", () => {
    const view = createReviewView({ loadSessions: () => [] });
    expect(view.name).toBe("Review");
  });

  it("renders review sessions", () => {
    const sessions = [makeReview("abc", 5), makeReview("def", 0)];
    const view = createReviewView({ loadSessions: () => sessions });

    const lines: string[] = [];
    const mockScreen = {
      rows: 24,
      cols: 80,
      writeLine: (_row: number, text: string) => lines.push(text),
    };
    view.render(mockScreen as never, 0, 20);
    expect(lines.length).toBeGreaterThan(0);
  });

  it("handles arrow key navigation", () => {
    const sessions = [makeReview("a"), makeReview("b")];
    const view = createReviewView({ loadSessions: () => sessions });
    expect(
      view.onKey({
        name: "down",
        ctrl: false,
        shift: false,
        raw: Buffer.alloc(0),
      }),
    ).toBe(true);
  });

  it("refreshes on r key", () => {
    let callCount = 0;
    const view = createReviewView({
      loadSessions: () => {
        callCount++;
        return [];
      },
    });

    view.onKey({ name: "r", ctrl: false, shift: false, raw: Buffer.alloc(0) });
    expect(callCount).toBe(2); // initial + refresh
  });
});
