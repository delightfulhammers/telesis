import type { AgentEvent } from "./types.js";

/**
 * Reconstruct a readable text narrative from a sequence of ACP session events.
 *
 * Output events are concatenated into a running text buffer.
 * Tool call events emit an inline `[tool: <name>]` marker.
 * Thinking events emit a `[thinking...]` marker.
 * Other event types are silently skipped.
 */
export const reconstructSessionText = (
  events: readonly AgentEvent[],
): string => {
  const parts: string[] = [];

  for (const event of events) {
    switch (event.type) {
      case "output": {
        const text = typeof event.text === "string" ? event.text : "";
        if (text.length > 0) parts.push(text);
        break;
      }
      case "tool_call": {
        const toolName =
          typeof event.tool === "string" ? event.tool : "unknown";
        parts.push(`\n[tool: ${toolName}]\n`);
        const result =
          typeof event.result === "string" ? event.result : undefined;
        if (result) parts.push(result);
        break;
      }
      case "thinking": {
        parts.push("\n[thinking...]\n");
        break;
      }
      // diffs, cancelled, etc. — silently skip
    }
  }

  return parts.join("");
};
