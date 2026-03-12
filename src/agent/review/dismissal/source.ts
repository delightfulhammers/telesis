import type { DismissalReason } from "./types.js";

export interface DismissalSignal {
  readonly findingId?: string;
  readonly path: string;
  readonly description: string;
  readonly reason: DismissalReason;
  readonly platformRef: string; // e.g., "github:PR#42/thread/123"
}

export interface DismissalSource {
  readonly platform: string;
  fetchDismissals(): Promise<readonly DismissalSignal[]>;
}
