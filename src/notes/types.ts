export interface Note {
  readonly id: string;
  readonly timestamp: string;
  readonly text: string;
  readonly tags: readonly string[];
}
