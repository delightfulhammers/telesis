import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import type { TelemetryLogger } from "../telemetry/logger.js";
import type {
  CompletionRequest,
  CompletionResponse,
  StreamEvent,
  TokenUsage,
} from "./types.js";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_MAX_TOKENS = 8192;
const RETRY_DELAY_MS = 1000;

interface ModelClientOptions {
  readonly sdk: Pick<Anthropic, "messages">;
  readonly telemetry: TelemetryLogger;
  readonly sessionId: string;
  readonly component: string;
  readonly defaultModel?: string;
}

export interface ModelClient {
  readonly complete: (
    request: CompletionRequest,
  ) => Promise<CompletionResponse>;
  readonly completeStream: (
    request: CompletionRequest,
  ) => AsyncIterable<StreamEvent>;
}

const extractUsage = (usage: Anthropic.Usage): TokenUsage => {
  const raw = usage as unknown as Record<string, unknown>;
  const numOrUndef = (key: string): number | undefined => {
    const val = raw[key];
    return typeof val === "number" ? val : undefined;
  };
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: numOrUndef("cache_read_input_tokens"),
    cacheWriteTokens: numOrUndef("cache_creation_input_tokens"),
  };
};

const toCompletionResponse = (
  message: Anthropic.Message,
  durationMs: number,
): CompletionResponse => {
  const content = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
  const usage = extractUsage(message.usage);
  return { content, usage, durationMs };
};

const buildParams = (
  request: CompletionRequest,
  defaultModel: string,
): Anthropic.MessageCreateParams => {
  const params: Anthropic.MessageCreateParams = {
    model: request.model ?? defaultModel,
    max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: request.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  };
  if (request.system) {
    params.system = request.system;
  }
  return params;
};

const isTransientError = (err: unknown): boolean => {
  // SDK wraps network errors in APIConnectionError/APITimeoutError
  if (err instanceof Anthropic.APIConnectionError) return true;
  if (err instanceof Anthropic.APIError) {
    return err.status === 429 || err.status >= 500;
  }
  return false;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const createModelClient = (options: ModelClientOptions): ModelClient => {
  const {
    sdk,
    telemetry,
    sessionId,
    component,
    defaultModel = DEFAULT_MODEL,
  } = options;

  const logTelemetry = (
    model: string,
    usage: TokenUsage,
    durationMs: number,
  ): void => {
    telemetry.log({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      component,
      model,
      provider: "anthropic",
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      durationMs,
      sessionId,
    });
  };

  const complete = async (
    request: CompletionRequest,
  ): Promise<CompletionResponse> => {
    const params = buildParams(request, defaultModel);
    let start = performance.now();

    let response: Anthropic.Message;
    try {
      response = (await sdk.messages.create(params)) as Anthropic.Message;
    } catch (err) {
      if (!isTransientError(err)) throw err;
      await sleep(RETRY_DELAY_MS);
      start = performance.now();
      response = (await sdk.messages.create(params)) as Anthropic.Message;
    }

    const result = toCompletionResponse(response, performance.now() - start);
    logTelemetry(params.model, result.usage, result.durationMs);
    return result;
  };

  const completeStream = async function* (
    request: CompletionRequest,
  ): AsyncIterable<StreamEvent> {
    const params = buildParams(request, defaultModel);

    let stream;
    try {
      stream = await sdk.messages.create({ ...params, stream: true });
    } catch (err) {
      if (!isTransientError(err)) throw err;
      await sleep(RETRY_DELAY_MS);
      stream = await sdk.messages.create({ ...params, stream: true });
    }

    // Both the real SDK stream and our test mock expose an async iterator
    // and a finalMessage() method. The cast through unknown bridges the
    // type gap — this is intentionally inside the SDK adapter boundary.
    const streamIterable = stream as unknown as AsyncIterable<{
      type: string;
      delta?: { type: string; text?: string };
    }> & {
      finalMessage: () => Promise<Anthropic.Message>;
    };

    // Accumulate only network wait time, excluding time the generator
    // is suspended at yield (consumer processing time).
    let networkMs = 0;
    const iterator = streamIterable[Symbol.asyncIterator]();

    for (;;) {
      const iterStart = performance.now();
      const { value: event, done } = await iterator.next();
      networkMs += performance.now() - iterStart;
      if (done) break;

      if (
        event.type === "content_block_delta" &&
        event.delta?.type === "text_delta" &&
        event.delta.text
      ) {
        yield { type: "text", text: event.delta.text };
      }
    }

    const finalStart = performance.now();
    const finalMessage = await streamIterable.finalMessage();
    networkMs += performance.now() - finalStart;

    const result = toCompletionResponse(finalMessage, networkMs);
    logTelemetry(params.model, result.usage, result.durationMs);

    yield { type: "done", response: result };
  };

  return { complete, completeStream };
};
