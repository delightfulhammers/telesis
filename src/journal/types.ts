export interface JournalEntry {
  readonly id: string; // UUID
  readonly date: string; // YYYY-MM-DD
  readonly title: string;
  readonly body: string;
  readonly timestamp: string; // ISO 8601
}
