export interface ModelCallRecord {
  readonly id: string;
  readonly timestamp: string;
  readonly component: string;
  readonly model: string;
  readonly provider: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
  readonly durationMs: number;
  readonly sessionId: string;
}
