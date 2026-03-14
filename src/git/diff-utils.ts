/** Truncate a diff to a bounded character count, appending a note if truncated */
export const boundDiff = (diff: string, maxChars: number): string => {
  if (diff.length <= maxChars) return diff;
  const truncatedK = Math.round(maxChars / 1000);
  return (
    diff.slice(0, maxChars) +
    `\n\n[diff truncated — showing first ${truncatedK}k characters]`
  );
};
