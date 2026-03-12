import { watch, statSync, type FSWatcher } from "node:fs";
import { join, relative, sep } from "node:path";
import type { EventBus } from "./bus.js";
import {
  createEvent,
  DEFAULT_IGNORE_PATTERNS,
  type EventType,
} from "./types.js";

const DEBOUNCE_MS = 50;

/** Normalize OS-native path separators to forward slashes */
const toPosix = (p: string): string =>
  sep === "/" ? p : p.split(sep).join("/");

/** Check if a relative path matches any ignore pattern */
const isIgnored = (relPath: string, patterns: readonly string[]): boolean =>
  patterns.some((pattern) => {
    const bare = pattern.replace(/\/$/, "");
    return (
      relPath === pattern || relPath === bare || relPath.startsWith(bare + "/")
    );
  });

/** Determine the event type for a filesystem change.
 *  knownPaths tracks files we've seen to distinguish create from modify
 *  on macOS where atomic writes report as "rename" events. */
const classifyChange = (
  absolutePath: string,
  eventType: string,
  knownPaths: Set<string>,
): EventType | null => {
  if (eventType === "rename") {
    try {
      const stat = statSync(absolutePath);
      if (stat.isDirectory()) {
        return "fs:dir:created";
      }
      // Distinguish new file from atomic write (rename on existing file)
      if (knownPaths.has(absolutePath)) {
        return "fs:file:modified";
      }
      knownPaths.add(absolutePath);
      return "fs:file:created";
    } catch {
      knownPaths.delete(absolutePath);
      return "fs:file:deleted";
    }
  }

  if (eventType === "change") {
    try {
      const stat = statSync(absolutePath);
      if (stat.isDirectory()) return null;
      knownPaths.add(absolutePath);
      return "fs:file:modified";
    } catch {
      return null;
    }
  }

  return null;
};

/** Result of starting a watcher */
export interface WatcherHandle {
  /** Stop watching */
  readonly close: () => void;
}

/** Start watching a directory for filesystem changes, emitting events to the bus */
export const startWatcher = (
  rootDir: string,
  bus: EventBus,
  ignorePatterns: readonly string[] = DEFAULT_IGNORE_PATTERNS,
): WatcherHandle => {
  const debounceMap = new Map<string, ReturnType<typeof setTimeout>>();
  const knownPaths = new Set<string>();
  let fsWatcher: FSWatcher | null = null;

  const handleChange = (eventType: string, filename: string | null): void => {
    if (!filename) return;

    // Normalize: on some platforms filename may be absolute or use native separators
    const relPath = toPosix(
      filename.startsWith("/") ? relative(rootDir, filename) : filename,
    );
    if (isIgnored(relPath, ignorePatterns)) return;

    // Debounce: collapse rapid changes to the same file
    const existing = debounceMap.get(relPath);
    if (existing) clearTimeout(existing);

    debounceMap.set(
      relPath,
      setTimeout(() => {
        debounceMap.delete(relPath);

        const absolutePath = join(rootDir, relPath);
        const type = classifyChange(absolutePath, eventType, knownPaths);
        if (!type) return;

        bus.publish(createEvent(type, { path: relPath, absolutePath }));
      }, DEBOUNCE_MS),
    );
  };

  fsWatcher = watch(rootDir, { recursive: true }, handleChange);

  return {
    close: () => {
      if (fsWatcher) {
        fsWatcher.close();
        fsWatcher = null;
      }
      for (const timer of debounceMap.values()) {
        clearTimeout(timer);
      }
      debounceMap.clear();
    },
  };
};
