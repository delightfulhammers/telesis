import type { TelesisDaemonEvent } from "../daemon/types.js";

const MAX_DIGEST_CHARS = 8000;
const MAX_DATA_SNIPPET = 200;

/** Format a single event as a concise digest line */
const formatEventDigestLine = (event: TelesisDaemonEvent): string => {
  switch (event.type) {
    case "dispatch:agent:thinking":
      return `[thinking] seq=${event.payload.seq}`;

    case "dispatch:agent:tool_call": {
      const tool =
        typeof event.payload.data.tool === "string"
          ? event.payload.data.tool
          : "unknown";
      const input =
        typeof event.payload.data.input === "string"
          ? truncate(event.payload.data.input, MAX_DATA_SNIPPET)
          : "";
      return `[tool_call] seq=${event.payload.seq} tool=${tool}${input ? ` input="${input}"` : ""}`;
    }

    case "dispatch:agent:output": {
      const text =
        typeof event.payload.data.text === "string"
          ? truncate(event.payload.data.text, MAX_DATA_SNIPPET)
          : "";
      return `[output] seq=${event.payload.seq}${text ? ` "${text}"` : ""}`;
    }

    case "dispatch:agent:cancelled":
      return `[cancelled] seq=${event.payload.seq}`;

    case "dispatch:session:started":
      return `[session:started] agent=${event.payload.agent} task="${truncate(event.payload.task, 100)}"`;

    case "dispatch:session:completed":
      return `[session:completed] events=${event.payload.eventCount} duration=${Math.floor(event.payload.durationMs / 1000)}s`;

    case "dispatch:session:failed":
      return `[session:failed] error="${truncate(event.payload.error, 100)}"`;

    default:
      return `[${event.type}]`;
  }
};

const truncate = (text: string, maxLen: number): string =>
  text.length > maxLen ? text.slice(0, maxLen - 1) + "…" : text;

/**
 * Format buffered events as a digest for model input.
 * Prioritizes most recent events. Caps output at ~8k chars.
 */
export const formatEventDigest = (
  events: readonly TelesisDaemonEvent[],
): string => {
  if (events.length === 0) return "(no events)";

  // Format all events, newest first for prioritization
  const lines = events.map((e, i) => `${i + 1}. ${formatEventDigestLine(e)}`);

  // Build digest from most recent events, respecting char budget
  const result: string[] = [];
  let charCount = 0;

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (charCount + line.length + 1 > MAX_DIGEST_CHARS) continue;
    result.push(line);
    charCount += line.length + 1;
  }

  result.reverse();

  const skipped = events.length - result.length;
  const header =
    skipped > 0
      ? `Event digest (${result.length} of ${events.length} events, ${skipped} earlier events omitted):\n\n`
      : `Event digest (${events.length} events):\n\n`;

  return header + result.join("\n");
};
