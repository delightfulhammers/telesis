import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createModelClient } from "./client.js";
import { createTelemetryLogger } from "../telemetry/logger.js";
import type { CompletionRequest } from "./types.js";

const makeTempDir = (): string =>
  mkdtempSync(join(tmpdir(), "telesis-model-test-"));

const makeMockSdk = (response: {
  content: Array<{ type: string; text: string }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}) => ({
  messages: {
    create: vi.fn().mockResolvedValue(response),
  },
});

const makeStreamMockSdk = (
  textChunks: string[],
  finalMessage: {
    content: Array<{ type: string; text: string }>;
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  },
) => ({
  messages: {
    create: vi.fn().mockResolvedValue({
      [Symbol.asyncIterator]: async function* () {
        for (const text of textChunks) {
          yield {
            type: "content_block_delta",
            delta: { type: "text_delta", text },
          };
        }
      },
      finalMessage: async () => finalMessage,
    }),
  },
});

describe("ModelClient", () => {
  describe("complete", () => {
    it("returns content and usage from SDK response", async () => {
      const rootDir = makeTempDir();
      mkdirSync(join(rootDir, ".telesis"), { recursive: true });
      const telemetry = createTelemetryLogger(rootDir);

      const mockSdk = makeMockSdk({
        content: [{ type: "text", text: "Hello, world!" }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const client = createModelClient({
        sdk: mockSdk,
        telemetry,
        sessionId: "test-session",
        component: "test",
      });

      const request: CompletionRequest = {
        messages: [{ role: "user", content: "Hi" }],
      };
      const response = await client.complete(request);

      expect(response.content).toBe("Hello, world!");
      expect(response.usage.inputTokens).toBe(100);
      expect(response.usage.outputTokens).toBe(50);
      expect(response.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("passes model and system prompt to SDK", async () => {
      const rootDir = makeTempDir();
      mkdirSync(join(rootDir, ".telesis"), { recursive: true });
      const telemetry = createTelemetryLogger(rootDir);

      const mockSdk = makeMockSdk({
        content: [{ type: "text", text: "response" }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const client = createModelClient({
        sdk: mockSdk,
        telemetry,
        sessionId: "test-session",
        component: "test",
        defaultModel: "custom-model",
      });

      await client.complete({
        system: "You are helpful.",
        messages: [{ role: "user", content: "Hi" }],
      });

      expect(mockSdk.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "custom-model",
          system: "You are helpful.",
        }),
      );
    });

    it("allows request to override default model", async () => {
      const rootDir = makeTempDir();
      mkdirSync(join(rootDir, ".telesis"), { recursive: true });
      const telemetry = createTelemetryLogger(rootDir);

      const mockSdk = makeMockSdk({
        content: [{ type: "text", text: "ok" }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const client = createModelClient({
        sdk: mockSdk,
        telemetry,
        sessionId: "test-session",
        component: "test",
        defaultModel: "default-model",
      });

      await client.complete({
        model: "override-model",
        messages: [{ role: "user", content: "Hi" }],
      });

      expect(mockSdk.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({ model: "override-model" }),
      );
    });

    it("logs telemetry record on successful completion", async () => {
      const rootDir = makeTempDir();
      mkdirSync(join(rootDir, ".telesis"), { recursive: true });
      const telemetry = createTelemetryLogger(rootDir);

      const mockSdk = makeMockSdk({
        content: [{ type: "text", text: "response" }],
        usage: {
          input_tokens: 200,
          output_tokens: 100,
          cache_read_input_tokens: 50,
          cache_creation_input_tokens: 25,
        },
      });

      const client = createModelClient({
        sdk: mockSdk,
        telemetry,
        sessionId: "sess-123",
        component: "interview",
      });

      await client.complete({
        messages: [{ role: "user", content: "Hi" }],
      });

      const lines = readFileSync(
        join(rootDir, ".telesis", "telemetry.jsonl"),
        "utf-8",
      )
        .trim()
        .split("\n");
      expect(lines).toHaveLength(1);

      const record = JSON.parse(lines[0]);
      expect(record.sessionId).toBe("sess-123");
      expect(record.component).toBe("interview");
      expect(record.inputTokens).toBe(200);
      expect(record.outputTokens).toBe(100);
      expect(record.cacheReadTokens).toBe(50);
      expect(record.cacheWriteTokens).toBe(25);
      expect(record.provider).toBe("anthropic");
    });

    it("retries once on failure then throws", async () => {
      const rootDir = makeTempDir();
      mkdirSync(join(rootDir, ".telesis"), { recursive: true });
      const telemetry = createTelemetryLogger(rootDir);

      const mockSdk = {
        messages: {
          create: vi
            .fn()
            .mockRejectedValueOnce(new Error("API rate limit"))
            .mockRejectedValueOnce(new Error("API rate limit")),
        },
      };

      const client = createModelClient({
        sdk: mockSdk,
        telemetry,
        sessionId: "test-session",
        component: "test",
      });

      await expect(
        client.complete({ messages: [{ role: "user", content: "Hi" }] }),
      ).rejects.toThrow("API rate limit");

      expect(mockSdk.messages.create).toHaveBeenCalledTimes(2);
    });

    it("succeeds on retry after first failure", async () => {
      const rootDir = makeTempDir();
      mkdirSync(join(rootDir, ".telesis"), { recursive: true });
      const telemetry = createTelemetryLogger(rootDir);

      const mockSdk = {
        messages: {
          create: vi
            .fn()
            .mockRejectedValueOnce(new Error("transient error"))
            .mockResolvedValueOnce({
              content: [{ type: "text", text: "recovered" }],
              usage: { input_tokens: 10, output_tokens: 5 },
            }),
        },
      };

      const client = createModelClient({
        sdk: mockSdk,
        telemetry,
        sessionId: "test-session",
        component: "test",
      });

      const response = await client.complete({
        messages: [{ role: "user", content: "Hi" }],
      });

      expect(response.content).toBe("recovered");
      expect(mockSdk.messages.create).toHaveBeenCalledTimes(2);
    });
  });

  describe("completeStream", () => {
    it("yields text chunks and a done event with full response", async () => {
      const rootDir = makeTempDir();
      mkdirSync(join(rootDir, ".telesis"), { recursive: true });
      const telemetry = createTelemetryLogger(rootDir);

      const mockSdk = makeStreamMockSdk(["Hello, ", "world!"], {
        content: [{ type: "text", text: "Hello, world!" }],
        usage: { input_tokens: 50, output_tokens: 25 },
      });

      const client = createModelClient({
        sdk: mockSdk,
        telemetry,
        sessionId: "test-session",
        component: "test",
      });

      const events = [];
      for await (const event of client.completeStream({
        messages: [{ role: "user", content: "Hi" }],
      })) {
        events.push(event);
      }

      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({ type: "text", text: "Hello, " });
      expect(events[1]).toEqual({ type: "text", text: "world!" });
      expect(events[2].type).toBe("done");
      expect(events[2].response?.content).toBe("Hello, world!");
      expect(events[2].response?.usage.inputTokens).toBe(50);
    });

    it("logs telemetry after stream completes", async () => {
      const rootDir = makeTempDir();
      mkdirSync(join(rootDir, ".telesis"), { recursive: true });
      const telemetry = createTelemetryLogger(rootDir);

      const mockSdk = makeStreamMockSdk(["text"], {
        content: [{ type: "text", text: "text" }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const client = createModelClient({
        sdk: mockSdk,
        telemetry,
        sessionId: "sess-456",
        component: "generate:vision",
      });

      // Consume the stream
      for await (const _ of client.completeStream({
        messages: [{ role: "user", content: "Hi" }],
      })) {
        // drain
      }

      const lines = readFileSync(
        join(rootDir, ".telesis", "telemetry.jsonl"),
        "utf-8",
      )
        .trim()
        .split("\n");
      expect(lines).toHaveLength(1);

      const record = JSON.parse(lines[0]);
      expect(record.component).toBe("generate:vision");
      expect(record.inputTokens).toBe(100);
    });
  });
});
