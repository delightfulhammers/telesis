import type { ModelClient } from "../agent/model/client.js";
import type { DispatchContext } from "../dispatch/context.js";
import type { TelesisDaemonEvent } from "../daemon/types.js";
import { parseJsonResponse } from "../agent/review/json-parse.js";
import { formatEventDigest } from "./format.js";
import { buildChroniclerPrompt } from "./prompts.js";
import { appendNote } from "../notes/store.js";
import type {
  AnalyzeFn,
  ChroniclerNote,
  ObserverOutput,
  PolicyFile,
} from "./types.js";

interface RawNote {
  readonly text?: string;
  readonly tags?: readonly string[];
}

const isValidRawNote = (val: unknown): val is RawNote => {
  if (!val || typeof val !== "object") return false;
  const obj = val as Record<string, unknown>;
  return typeof obj.text === "string" && obj.text.length > 0;
};

const normalizeNote = (raw: RawNote, sessionId: string): ChroniclerNote => {
  const TAG_PATTERN = /^[\w:.-]+$/;
  const baseTags = Array.isArray(raw.tags)
    ? raw.tags
        .filter((t): t is string => typeof t === "string")
        .filter((t) => TAG_PATTERN.test(t))
    : [];

  const sessionPrefix = sessionId.slice(0, 8);
  const allTags = [
    ...new Set(["agent:chronicler", `session:${sessionPrefix}`, ...baseTags]),
  ];

  return {
    text: raw.text!.slice(0, 4000),
    tags: allTags,
  };
};

/** Create a chronicler analyzer function */
export const createChroniclerAnalyzer = (
  client: ModelClient,
  policy: PolicyFile,
  sessionId: string,
  rootDir: string,
): AnalyzeFn => {
  const analyze: AnalyzeFn = async (
    events: readonly TelesisDaemonEvent[],
    context: DispatchContext,
  ): Promise<ObserverOutput> => {
    if (events.length === 0) return { findings: [], notes: [] };

    const system = buildChroniclerPrompt(policy, context);
    const digest = formatEventDigest(events);

    const response = await client.complete({
      model: policy.model,
      system,
      messages: [{ role: "user", content: digest }],
      maxTokens: 4096,
    });

    try {
      const parsed = parseJsonResponse(response.content);
      if (!Array.isArray(parsed)) return { findings: [], notes: [] };

      const notes = parsed
        .filter(isValidRawNote)
        .map((raw) => normalizeNote(raw, sessionId));

      // Write each note to the notes store
      for (const note of notes) {
        try {
          appendNote(rootDir, note.text, note.tags);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`oversight: chronicler failed to write note: ${msg}`);
        }
      }

      return { findings: [], notes };
    } catch {
      console.error(
        "oversight: chronicler could not parse model response as notes JSON.",
      );
      return { findings: [], notes: [] };
    }
  };

  return analyze;
};
