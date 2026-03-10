/**
 * Shared markdown section extraction utility.
 *
 * Used by structural and actionability evaluators to extract content
 * under headings with consistent heading-level-aware boundary detection.
 */

/**
 * Extracts the content under a heading matched by the given pattern.
 *
 * Returns text from after the heading to the next heading of equal or higher
 * level (fewer or equal `#` characters), or end of document. Sub-headings
 * are included in the returned content.
 *
 * Returns `null` if the heading pattern is not found.
 */
export const extractMarkdownSection = (
  content: string,
  headingPattern: RegExp,
): string | null => {
  const match = headingPattern.exec(content);
  if (!match) return null;

  const levelMatch = match[0].match(/^(#+)/);
  const level = levelMatch ? levelMatch[1].length : 2;

  // Use lastIndex on a global+multiline regex to avoid substring allocation.
  // Stops at the next heading of equal or higher level (intentional — standard
  // markdown section boundary semantics).
  const startIdx = match.index! + match[0].length;
  const closingPattern = new RegExp(`^#{1,${level}}\\s`, "gm");
  closingPattern.lastIndex = startIdx;
  const nextMatch = closingPattern.exec(content);

  const sectionBody = nextMatch
    ? content.substring(startIdx, nextMatch.index)
    : content.substring(startIdx);

  return sectionBody.trim() || null;
};
