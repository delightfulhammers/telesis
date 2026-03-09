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
  // Cache token fields exist on the Usage type but TypeScript's strict mode
  // doesn't allow direct property access via `in` checks without a cast.
  const raw = usage as unknown as Record<string, number | undefined>;
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: raw.cache_read_input_tokens,
    cacheWriteTokens: raw.cache_creation_input_tokens,
  };
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
    const start = Date.now();

    let response: Anthropic.Message;
    try {
      response = (await sdk.messages.create(params)) as Anthropic.Message;
    } catch {
      await sleep(RETRY_DELAY_MS);
      response = (await sdk.messages.create(params)) as Anthropic.Message;
    }

    const durationMs = Date.now() - start;
    const content = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    const usage = extractUsage(response.usage);

    logTelemetry(params.model, usage, durationMs);

    return { content, usage, durationMs };
  };

  const completeStream = async function* (
    request: CompletionRequest,
  ): AsyncIterable<StreamEvent> {
    const params = buildParams(request, defaultModel);
    const start = Date.now();

    const stream = await sdk.messages.create({
      ...params,
      stream: true,
    });

    // Both the real SDK stream and our test mock expose an async iterator
    // and a finalMessage() method. The cast through unknown bridges the type gap.
    const streamIterable = stream as unknown as AsyncIterable<{
      type: string;
      delta?: { type: string; text?: string };
    }> & {
      finalMessage: () => Promise<Anthropic.Message>;
    };

    for await (const event of streamIterable) {
      if (
        event.type === "content_block_delta" &&
        event.delta?.type === "text_delta" &&
        event.delta.text
      ) {
        yield { type: "text", text: event.delta.text };
      }
    }

    const finalMessage = await streamIterable.finalMessage();
    const durationMs = Date.now() - start;
    const content = finalMessage.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    const usage = extractUsage(finalMessage.usage);

    logTelemetry(params.model, usage, durationMs);

    yield {
      type: "done",
      response: { content, usage, durationMs },
    };
  };

  return { complete, completeStream };
};
