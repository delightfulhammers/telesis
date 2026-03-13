import { randomUUID } from "node:crypto";
import type { TelesisDaemonEvent } from "../daemon/types.js";
import { createEvent } from "../daemon/types.js";
import type { IntakeSource } from "./source.js";
import { createWorkItem, listWorkItems } from "./store.js";
import type { WorkItem, IntakeSyncResult } from "./types.js";

/** Sync work items from an IntakeSource into the local store */
export const syncFromSource = async (
  rootDir: string,
  source: IntakeSource,
  onEvent?: (event: TelesisDaemonEvent) => void,
): Promise<IntakeSyncResult> => {
  onEvent?.(
    createEvent("intake:sync:started", {
      source: source.kind,
      imported: 0,
      skippedDuplicate: 0,
    }),
  );

  const rawIssues = await source.fetchIssues();

  // Dedup set built once upfront — O(M) scan then O(1) per issue.
  // Includes all non-failed items in the dedup set, preventing re-import
  // of pending/approved/dispatching/completed/skipped items. Failed items
  // are excluded from the set so they can be re-imported on next sync.
  // Not safe against concurrent sync invocations: two parallel syncs
  // may both attempt to import the same issue. The createWorkItem
  // existence check prevents silent overwrites — concurrent imports
  // surface as "already exists" errors in the result.
  const existingKeys = new Set(
    listWorkItems(rootDir)
      .filter((i) => i.status !== "failed")
      .map((i) => `${i.source}:${i.sourceId}`),
  );

  let imported = 0;
  let skippedDuplicate = 0;
  const errors: string[] = [];

  for (const raw of rawIssues) {
    try {
      if (existingKeys.has(`${source.kind}:${raw.sourceId}`)) {
        skippedDuplicate++;
        continue;
      }

      const item: WorkItem = {
        id: randomUUID(),
        source: source.kind,
        sourceId: raw.sourceId,
        sourceUrl: raw.sourceUrl,
        title: raw.title,
        body: raw.body,
        labels: [...raw.labels],
        assignee: raw.assignee,
        priority: raw.priority,
        status: "pending",
        importedAt: new Date().toISOString(),
      };

      createWorkItem(rootDir, item);
      existingKeys.add(`${source.kind}:${raw.sourceId}`);
      imported++;

      onEvent?.(
        createEvent("intake:item:imported", {
          itemId: item.id,
          source: source.kind,
          sourceId: raw.sourceId,
          title: raw.title,
        }),
      );
    } catch (err) {
      // Concurrent sync race: createWorkItem throws "already exists"
      if (err instanceof Error && err.message.includes("already exists")) {
        existingKeys.add(`${source.kind}:${raw.sourceId}`);
        skippedDuplicate++;
      } else {
        errors.push(
          `Failed to import ${source.kind}#${raw.sourceId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  const result: IntakeSyncResult = { imported, skippedDuplicate, errors };

  onEvent?.(
    createEvent("intake:sync:completed", {
      source: source.kind,
      imported,
      skippedDuplicate,
    }),
  );

  return result;
};
