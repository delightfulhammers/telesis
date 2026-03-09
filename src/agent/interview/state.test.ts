import { describe, it, expect } from "vitest";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createInitialState,
  addTurn,
  markComplete,
  saveState,
  loadState,
} from "./state.js";
import { useTempDir } from "../../test-utils.js";

const makeTempDir = useTempDir("interview-state-test");

describe("InterviewState", () => {
  describe("createInitialState", () => {
    it("creates empty state with session ID", () => {
      const state = createInitialState("sess-1");
      expect(state.sessionId).toBe("sess-1");
      expect(state.turns).toEqual([]);
      expect(state.complete).toBe(false);
      expect(state.turnCount).toBe(0);
    });
  });

  describe("addTurn", () => {
    it("appends a user turn and increments turnCount", () => {
      const state = createInitialState("sess-1");
      const next = addTurn(state, { role: "user", content: "Hello" });

      expect(next.turns).toHaveLength(1);
      expect(next.turns[0]).toEqual({ role: "user", content: "Hello" });
      expect(next.turnCount).toBe(1);
    });

    it("appends an assistant turn without incrementing turnCount", () => {
      const state = createInitialState("sess-1");
      const next = addTurn(state, {
        role: "assistant",
        content: "Hi there!",
      });

      expect(next.turns).toHaveLength(1);
      expect(next.turns[0]).toEqual({
        role: "assistant",
        content: "Hi there!",
      });
      expect(next.turnCount).toBe(0);
    });

    it("preserves existing turns when adding", () => {
      let state = createInitialState("sess-1");
      state = addTurn(state, { role: "assistant", content: "Q1" });
      state = addTurn(state, { role: "user", content: "A1" });
      state = addTurn(state, { role: "assistant", content: "Q2" });

      expect(state.turns).toHaveLength(3);
      expect(state.turnCount).toBe(1);
    });

    it("does not mutate the original state", () => {
      const state = createInitialState("sess-1");
      const next = addTurn(state, { role: "user", content: "Hello" });

      expect(state.turns).toHaveLength(0);
      expect(state.turnCount).toBe(0);
      expect(next.turns).toHaveLength(1);
      expect(next.turnCount).toBe(1);
    });
  });

  describe("markComplete", () => {
    it("sets complete to true", () => {
      const state = createInitialState("sess-1");
      const completed = markComplete(state);
      expect(completed.complete).toBe(true);
    });

    it("preserves other fields", () => {
      let state = createInitialState("sess-1");
      state = addTurn(state, { role: "user", content: "Hi" });
      const completed = markComplete(state);

      expect(completed.sessionId).toBe("sess-1");
      expect(completed.turns).toHaveLength(1);
      expect(completed.turnCount).toBe(1);
    });
  });

  describe("saveState / loadState", () => {
    it("round-trips state through filesystem", () => {
      const rootDir = makeTempDir();
      let state = createInitialState("sess-42");
      state = addTurn(state, { role: "assistant", content: "Q1" });
      state = addTurn(state, { role: "user", content: "A1" });

      saveState(rootDir, state);
      const loaded = loadState(rootDir);

      expect(loaded).toEqual(state);
    });

    it("creates .telesis directory if missing", () => {
      const rootDir = makeTempDir();
      const state = createInitialState("sess-1");

      saveState(rootDir, state);

      const content = readFileSync(
        join(rootDir, ".telesis", "interview-state.json"),
        "utf-8",
      );
      expect(JSON.parse(content).sessionId).toBe("sess-1");
    });

    it("overwrites existing state file", () => {
      const rootDir = makeTempDir();
      mkdirSync(join(rootDir, ".telesis"), { recursive: true });

      saveState(rootDir, createInitialState("sess-1"));
      saveState(rootDir, createInitialState("sess-2"));

      const loaded = loadState(rootDir);
      expect(loaded?.sessionId).toBe("sess-2");
    });

    it("returns null when state file does not exist", () => {
      const rootDir = makeTempDir();
      expect(loadState(rootDir)).toBeNull();
    });

    it("writes formatted JSON with trailing newline", () => {
      const rootDir = makeTempDir();
      saveState(rootDir, createInitialState("sess-1"));

      const content = readFileSync(
        join(rootDir, ".telesis", "interview-state.json"),
        "utf-8",
      );
      expect(content).toContain("\n");
      expect(content.endsWith("\n")).toBe(true);
      // Formatted = multi-line, not single-line JSON
      expect(content.split("\n").length).toBeGreaterThan(2);
    });
  });
});
