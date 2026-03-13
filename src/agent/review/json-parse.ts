/**
 * Parses a JSON response from the model, handling markdown code fences,
 * preamble/postamble text, and inline JSON within prose.
 *
 * Extraction strategies (tried in order):
 * 1. Code fence: ```json\n...\n```
 * 2. Direct parse of the full content
 * 3. First JSON array found in the text (bracket matching)
 * 4. First JSON object found in the text (brace matching)
 */
export const parseJsonResponse = (content: string): unknown => {
  const trimmed = content.trim();

  // Strategy 1: Code fence extraction
  const fenceMatch = /```(?:\w*)\s*\n([\s\S]*?)\n?```/.exec(trimmed);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]!);
    } catch {
      // Fall through to subsequent strategies
    }
  }

  // Strategy 2: Direct parse
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall through to extraction strategies
  }

  // Strategy 3: Find first JSON array
  const arrayJson = extractBalanced(trimmed, "[", "]");
  if (arrayJson) {
    try {
      return JSON.parse(arrayJson);
    } catch {
      // Fall through
    }
  }

  // Strategy 4: Find first JSON object
  const objectJson = extractBalanced(trimmed, "{", "}");
  if (objectJson) {
    try {
      return JSON.parse(objectJson);
    } catch {
      // Fall through
    }
  }

  // Nothing worked — throw like the original
  return JSON.parse(trimmed);
};

/**
 * Extract a balanced bracket/brace-delimited substring from text.
 * Returns the first balanced match or null.
 */
const extractBalanced = (
  text: string,
  open: string,
  close: string,
): string | null => {
  const startIdx = text.indexOf(open);
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i]!;

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === open) depth++;
    if (ch === close) depth--;

    if (depth === 0) {
      return text.slice(startIdx, i + 1);
    }
  }

  return null;
};
