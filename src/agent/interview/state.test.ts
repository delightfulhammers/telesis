import { describe, it, expect } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
    it("round-trips state through filesystem", async () => {
      const rootDir = makeTempDir();
      let state = createInitialState("sess-42");
      state = addTurn(state, { role: "assistant", content: "Q1" });
      state = addTurn(state, { role: "user", content: "A1" });

      await saveState(rootDir, state);
      const loaded = await loadState(rootDir);

      expect(loaded).toEqual(state);
    });

    it("creates .telesis directory if missing", async () => {
      const rootDir = makeTempDir();
      const state = createInitialState("sess-1");

      await saveState(rootDir, state);

      const content = readFileSync(
        join(rootDir, ".telesis", "interview-state.json"),
        "utf-8",
      );
      expect(JSON.parse(content).sessionId).toBe("sess-1");
    });

    it("overwrites existing state file", async () => {
      const rootDir = makeTempDir();
      mkdirSync(join(rootDir, ".telesis"), { recursive: true });

      await saveState(rootDir, createInitialState("sess-1"));
      await saveState(rootDir, createInitialState("sess-2"));

      const loaded = await loadState(rootDir);
      expect(loaded?.sessionId).toBe("sess-2");
    });

    it("returns null when state file does not exist", async () => {
      const rootDir = makeTempDir();
      expect(await loadState(rootDir)).toBeNull();
    });

    it("writes formatted JSON with trailing newline", async () => {
      const rootDir = makeTempDir();
      await saveState(rootDir, createInitialState("sess-1"));

      const content = readFileSync(
        join(rootDir, ".telesis", "interview-state.json"),
        "utf-8",
      );
      expect(content).toContain("\n");
      expect(content.endsWith("\n")).toBe(true);
      // Formatted = multi-line, not single-line JSON
      expect(content.split("\n").length).toBeGreaterThan(2);
    });

    it("throws on malformed JSON with file path in message", async () => {
      const rootDir = makeTempDir();
      const dir = join(rootDir, ".telesis");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "interview-state.json"), "{bad json");

      await expect(loadState(rootDir)).rejects.toThrow(
        /Failed to parse interview state/,
      );
    });

    it("throws on valid JSON with invalid state shape", async () => {
      const rootDir = makeTempDir();
      const dir = join(rootDir, ".telesis");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "interview-state.json"),
        JSON.stringify({ sessionId: 123, complete: "yes" }),
      );

      await expect(loadState(rootDir)).rejects.toThrow(
        /Invalid interview state/,
      );
    });

    it("throws on turns with invalid role", async () => {
      const rootDir = makeTempDir();
      const dir = join(rootDir, ".telesis");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "interview-state.json"),
        JSON.stringify({
          sessionId: "s1",
          turns: [{ role: "system", content: "hi" }],
          complete: false,
          turnCount: 0,
        }),
      );

      await expect(loadState(rootDir)).rejects.toThrow(/invalid turns array/);
    });
  });
});
