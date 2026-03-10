/**
 * Parses a JSON response from the model, handling markdown code fences
 * and preamble/postamble text.
 */
export const parseJsonResponse = (content: string): unknown => {
  const trimmed = content.trim();

  const fenceMatch = /```(?:\w*)\s*\n([\s\S]*?)\n?```/.exec(trimmed);
  const jsonStr = fenceMatch ? fenceMatch[1] : trimmed;

  return JSON.parse(jsonStr);
};
