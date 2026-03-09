import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Anthropic from "@anthropic-ai/sdk";
import { createModelClient } from "./client.js";
import { createTelemetryLogger } from "../telemetry/logger.js";
import type { CompletionRequest } from "./types.js";

const makeTempDir = (): string =>
  mkdtempSync(join(tmpdir(), "telesis-model-test-"));

const makeClientWithMock = (
  mockSdk: { messages: { create: ReturnType<typeof vi.fn> } },
  options: {
    component?: string;
    sessionId?: string;
    defaultModel?: string;
  } = {},
) => {
  const rootDir = makeTempDir();
  mkdirSync(join(rootDir, ".telesis"), { recursive: true });
  const telemetry = createTelemetryLogger(rootDir);

  const client = createModelClient({
    sdk: mockSdk,
    telemetry,
    sessionId: options.sessionId ?? "test-session",
    component: options.component ?? "test",
    defaultModel: options.defaultModel,
  });

  return { client, rootDir };
};

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

const emptyHeaders = new Headers();

const makeTransientError = () =>
  new Anthropic.APIError(
    429,
    {
      type: "error",
      error: { type: "rate_limit_error", message: "Rate limited" },
    },
    "Rate limited",
    emptyHeaders,
  );

const makeNonTransientError = () =>
  new Anthropic.APIError(
    401,
    {
      type: "error",
      error: { type: "authentication_error", message: "Invalid API key" },
    },
    "Invalid API key",
    emptyHeaders,
  );

const defaultRequest: CompletionRequest = {
  messages: [{ role: "user", content: "Hi" }],
};

describe("ModelClient", () => {
  describe("complete", () => {
    it("returns content and usage from SDK response", async () => {
      const mockSdk = makeMockSdk({
        content: [{ type: "text", text: "Hello, world!" }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });
      const { client } = makeClientWithMock(mockSdk);

      const response = await client.complete(defaultRequest);

      expect(response.content).toBe("Hello, world!");
      expect(response.usage.inputTokens).toBe(100);
      expect(response.usage.outputTokens).toBe(50);
      expect(response.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("passes model and system prompt to SDK", async () => {
      const mockSdk = makeMockSdk({
        content: [{ type: "text", text: "response" }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });
      const { client } = makeClientWithMock(mockSdk, {
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
      const mockSdk = makeMockSdk({
        content: [{ type: "text", text: "ok" }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });
      const { client } = makeClientWithMock(mockSdk, {
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
      const mockSdk = makeMockSdk({
        content: [{ type: "text", text: "response" }],
        usage: {
          input_tokens: 200,
          output_tokens: 100,
          cache_read_input_tokens: 50,
          cache_creation_input_tokens: 25,
        },
      });
      const { client, rootDir } = makeClientWithMock(mockSdk, {
        sessionId: "sess-123",
        component: "interview",
      });

      await client.complete(defaultRequest);

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

    it("retries once on transient error then throws", async () => {
      const mockSdk = {
        messages: {
          create: vi
            .fn()
            .mockRejectedValueOnce(makeTransientError())
            .mockRejectedValueOnce(makeTransientError()),
        },
      };
      const { client } = makeClientWithMock(mockSdk);

      await expect(client.complete(defaultRequest)).rejects.toThrow(
        "Rate limited",
      );
      expect(mockSdk.messages.create).toHaveBeenCalledTimes(2);
    });

    it("succeeds on retry after transient failure", async () => {
      const mockSdk = {
        messages: {
          create: vi
            .fn()
            .mockRejectedValueOnce(makeTransientError())
            .mockResolvedValueOnce({
              content: [{ type: "text", text: "recovered" }],
              usage: { input_tokens: 10, output_tokens: 5 },
            }),
        },
      };
      const { client } = makeClientWithMock(mockSdk);

      const response = await client.complete(defaultRequest);

      expect(response.content).toBe("recovered");
      expect(mockSdk.messages.create).toHaveBeenCalledTimes(2);
    });

    it("does not retry on non-transient errors", async () => {
      const mockSdk = {
        messages: {
          create: vi.fn().mockRejectedValueOnce(makeNonTransientError()),
        },
      };
      const { client } = makeClientWithMock(mockSdk);

      await expect(client.complete(defaultRequest)).rejects.toThrow(
        "Invalid API key",
      );
      expect(mockSdk.messages.create).toHaveBeenCalledTimes(1);
    });

    it("returns empty string when response has no text blocks", async () => {
      const mockSdk = makeMockSdk({
        content: [],
        usage: { input_tokens: 10, output_tokens: 0 },
      });
      const { client } = makeClientWithMock(mockSdk);

      const response = await client.complete(defaultRequest);
      expect(response.content).toBe("");
    });
  });

  describe("completeStream", () => {
    it("yields text chunks and a done event with full response", async () => {
      const mockSdk = makeStreamMockSdk(["Hello, ", "world!"], {
        content: [{ type: "text", text: "Hello, world!" }],
        usage: { input_tokens: 50, output_tokens: 25 },
      });
      const { client } = makeClientWithMock(mockSdk);

      const events = [];
      for await (const event of client.completeStream(defaultRequest)) {
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
      const mockSdk = makeStreamMockSdk(["text"], {
        content: [{ type: "text", text: "text" }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });
      const { client, rootDir } = makeClientWithMock(mockSdk, {
        sessionId: "sess-456",
        component: "generate:vision",
      });

      for await (const _ of client.completeStream(defaultRequest)) {
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

    it("retries once on transient stream creation failure", async () => {
      const successStream = {
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: "content_block_delta",
            delta: { type: "text_delta", text: "ok" },
          };
        },
        finalMessage: async () => ({
          content: [{ type: "text", text: "ok" }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      };
      const mockSdk = {
        messages: {
          create: vi
            .fn()
            .mockRejectedValueOnce(makeTransientError())
            .mockResolvedValueOnce(successStream),
        },
      };
      const { client } = makeClientWithMock(mockSdk);

      const events = [];
      for await (const event of client.completeStream(defaultRequest)) {
        events.push(event);
      }

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({ type: "text", text: "ok" });
      expect(events[1].type).toBe("done");
      expect(mockSdk.messages.create).toHaveBeenCalledTimes(2);
    });

    it("does not retry stream creation on non-transient errors", async () => {
      const mockSdk = {
        messages: {
          create: vi.fn().mockRejectedValueOnce(makeNonTransientError()),
        },
      };
      const { client } = makeClientWithMock(mockSdk);

      const drain = async () => {
        for await (const _ of client.completeStream(defaultRequest)) {
          // drain
        }
      };

      await expect(drain()).rejects.toThrow("Invalid API key");
      expect(mockSdk.messages.create).toHaveBeenCalledTimes(1);
    });

    it("skips non-text-delta events in stream", async () => {
      const mockSdk = {
        messages: {
          create: vi.fn().mockResolvedValue({
            [Symbol.asyncIterator]: async function* () {
              yield { type: "message_start" };
              yield { type: "content_block_start" };
              yield {
                type: "content_block_delta",
                delta: { type: "text_delta", text: "hello" },
              };
              yield { type: "content_block_stop" };
              yield { type: "message_stop" };
            },
            finalMessage: async () => ({
              content: [{ type: "text", text: "hello" }],
              usage: { input_tokens: 10, output_tokens: 5 },
            }),
          }),
        },
      };
      const { client } = makeClientWithMock(mockSdk);

      const events = [];
      for await (const event of client.completeStream(defaultRequest)) {
        events.push(event);
      }

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({ type: "text", text: "hello" });
      expect(events[1].type).toBe("done");
    });
  });
});
