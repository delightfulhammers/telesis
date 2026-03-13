import type { WorkItem } from "./types.js";

const padRight = (s: string, len: number): string =>
  s.length >= len ? s : s + " ".repeat(len - s.length);

const truncate = (text: string, maxLen: number): string =>
  text.length > maxLen ? text.slice(0, maxLen - 1) + "…" : text;

/** Format a list of work items as a table */
export const formatWorkItemList = (items: readonly WorkItem[]): string => {
  if (items.length === 0) return "No work items.";

  const lines = items.map((item) => {
    const id = item.id.slice(0, 8);
    const status = padRight(item.status, 12);
    const source = padRight(`${item.source}#${item.sourceId}`, 14);
    const date = item.importedAt.slice(0, 19).replace("T", " ");
    const title = truncate(item.title, 50);
    return `${id}  ${status}  ${source}  ${date}  ${title}`;
  });

  const header = `${"ID".padEnd(8)}  ${"STATUS".padEnd(12)}  ${"SOURCE".padEnd(14)}  ${"IMPORTED".padEnd(19)}  TITLE`;
  return [header, ...lines].join("\n");
};

/** Format a single work item detail view */
export const formatWorkItemDetail = (item: WorkItem): string => {
  const lines = [
    `ID:       ${item.id}`,
    `Source:   ${item.source}#${item.sourceId}`,
    `URL:      ${item.sourceUrl}`,
    `Title:    ${item.title}`,
    `Status:   ${item.status}`,
    `Imported: ${item.importedAt}`,
    item.approvedAt ? `Approved: ${item.approvedAt}` : null,
    item.dispatchedAt ? `Dispatched: ${item.dispatchedAt}` : null,
    item.completedAt ? `Completed: ${item.completedAt}` : null,
    item.sessionId ? `Session:  ${item.sessionId}` : null,
    item.error ? `Error:    ${item.error}` : null,
    item.labels.length > 0 ? `Labels:   ${item.labels.join(", ")}` : null,
    item.assignee ? `Assignee: ${item.assignee}` : null,
    "",
    item.body || "(no description)",
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  return lines;
};
