import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../test-utils.js";
import { daemonStatus, stopDaemon } from "./lifecycle.js";

describe("lifecycle", () => {
  const makeTempDir = useTempDir("lifecycle");

  describe("daemonStatus", () => {
    it("returns not running when no PID file exists", async () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, ".telesis"), { recursive: true });

      const status = await daemonStatus(dir);
      expect(status.running).toBe(false);
    });

    it("returns not running when PID file has stale PID", async () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, ".telesis"), { recursive: true });
      writeFileSync(join(dir, ".telesis", "daemon.pid"), "2000000000");

      const status = await daemonStatus(dir);
      expect(status.running).toBe(false);
    });
  });

  describe("stopDaemon", () => {
    it("returns false when daemon is not running", async () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, ".telesis"), { recursive: true });

      const result = await stopDaemon(dir);
      expect(result).toBe(false);
    });
  });
});
