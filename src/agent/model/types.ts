export interface Message {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export interface CompletionRequest {
  readonly model?: string;
  readonly system?: string;
  readonly messages: readonly Message[];
  readonly maxTokens?: number;
}

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
}

export interface CompletionResponse {
  readonly content: string;
  readonly usage: TokenUsage;
  readonly durationMs: number;
}

export interface StreamEvent {
  readonly type: "text" | "done";
  readonly text?: string;
  readonly response?: CompletionResponse;
}
