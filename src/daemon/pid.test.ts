import { describe, it, expect } from "vitest";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../test-utils.js";
import { writePid, readPid, isRunning, removePid, runningPid } from "./pid.js";

describe("pid", () => {
  const makeTempDir = useTempDir("pid");

  describe("writePid", () => {
    it("creates .telesis/ and writes the PID", () => {
      const dir = makeTempDir();
      writePid(dir, 12345);

      const content = readFileSync(
        join(dir, ".telesis", "daemon.pid"),
        "utf-8",
      );
      expect(content).toBe("12345");
    });
  });

  describe("readPid", () => {
    it("returns the PID from the file", () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, ".telesis"), { recursive: true });
      writeFileSync(join(dir, ".telesis", "daemon.pid"), "42");

      expect(readPid(dir)).toBe(42);
    });

    it("returns null when file does not exist", () => {
      const dir = makeTempDir();
      expect(readPid(dir)).toBeNull();
    });

    it("returns null for non-numeric content", () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, ".telesis"), { recursive: true });
      writeFileSync(join(dir, ".telesis", "daemon.pid"), "not-a-pid");

      expect(readPid(dir)).toBeNull();
    });

    it("returns null for negative PID", () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, ".telesis"), { recursive: true });
      writeFileSync(join(dir, ".telesis", "daemon.pid"), "-1");

      expect(readPid(dir)).toBeNull();
    });
  });

  describe("isRunning", () => {
    it("returns true for current process PID", () => {
      expect(isRunning(process.pid)).toBe(true);
    });

    it("returns false for a PID that does not exist", () => {
      // Use a very high PID unlikely to be running
      expect(isRunning(2_000_000_000)).toBe(false);
    });
  });

  describe("removePid", () => {
    it("removes the PID file", () => {
      const dir = makeTempDir();
      writePid(dir, 999);
      removePid(dir);

      expect(readPid(dir)).toBeNull();
    });

    it("is safe when file does not exist", () => {
      const dir = makeTempDir();
      expect(() => removePid(dir)).not.toThrow();
    });
  });

  describe("runningPid", () => {
    it("returns PID when process is running", () => {
      const dir = makeTempDir();
      writePid(dir, process.pid);

      expect(runningPid(dir)).toBe(process.pid);
    });

    it("returns null when PID file has stale PID", () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, ".telesis"), { recursive: true });
      writeFileSync(join(dir, ".telesis", "daemon.pid"), "2000000000");

      expect(runningPid(dir)).toBeNull();
    });

    it("returns null when no PID file exists", () => {
      const dir = makeTempDir();
      expect(runningPid(dir)).toBeNull();
    });
  });
});
