import type { GeneratedDocs } from "../agent/generate/types.js";
import type { AxisScore, Diagnostic } from "./types.js";

/**
 * Extracts likely project name from the first heading of a document.
 * Strips common suffixes like "Vision", "PRD", "Architecture", etc.
 */
const extractProjectName = (content: string): string | null => {
  const match = /^#\s+(.+)/m.exec(content);
  if (!match) return null;

  const title = match[1].trim();
  // Strip common document type suffixes
  const cleaned = title
    .replace(
      /\s*[-—]\s*(vision|prd|product\s+requirements?|architecture|milestones?|roadmap)\s*$/i,
      "",
    )
    .replace(
      /\s+(vision|prd|product\s+requirements?|architecture|milestones?|roadmap)\s*$/i,
      "",
    )
    .trim();

  return cleaned || null;
};

/**
 * Checks whether all documents refer to the project by the same name.
 */
const checkNameConsistency = (
  docs: Required<GeneratedDocs>,
): { score: number; diagnostics: Diagnostic[] } => {
  const names = {
    vision: extractProjectName(docs.vision),
    prd: extractProjectName(docs.prd),
    architecture: extractProjectName(docs.architecture),
    milestones: extractProjectName(docs.milestones),
  };

  const foundNames = Object.values(names).filter(
    (n): n is string => n !== null && n.length > 0,
  );

  if (foundNames.length === 0) {
    return {
      score: 0,
      diagnostics: [
        {
          axis: "consistency",
          document: "global",
          message: "Could not extract project name from any document heading",
          severity: "warning",
        },
      ],
    };
  }

  // Check if all found names match (case-insensitive)
  const normalized = foundNames.map((n) => n.toLowerCase());
  const unique = new Set(normalized);

  if (unique.size === 1) {
    return { score: 1.0, diagnostics: [] };
  }

  const totalDocs = Object.keys(names).length;
  const missingCount = totalDocs - foundNames.length;
  const missingSuffix =
    missingCount > 0
      ? ` (${missingCount} document(s) had no extractable heading)`
      : "";

  const diagnostics: Diagnostic[] = [
    {
      axis: "consistency",
      document: "global",
      message: `Project name inconsistent across documents: ${[...unique].map((n) => `"${n}"`).join(", ")}${missingSuffix}`,
      severity: "warning",
    },
  ];

  // Score based on how many agree with the most common name
  const counts = new Map<string, number>();
  for (const n of normalized) {
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  const maxCount = Math.max(...counts.values());
  const score = maxCount / foundNames.length;

  return { score, diagnostics };
};

/**
 * Checks whether key terms from the PRD appear in the milestones.
 * This validates that the roadmap actually addresses the requirements.
 */
const checkPrdMilestoneAlignment = (
  docs: Required<GeneratedDocs>,
): { score: number; diagnostics: Diagnostic[] } => {
  if (!docs.prd.trim() || !docs.milestones.trim()) {
    return { score: 0, diagnostics: [] };
  }

  // Extract requirement keywords from PRD (look for list items)
  const requirementTerms: string[] = [];

  for (const match of docs.prd.matchAll(/^[-*]\s+(.+)$/gm)) {
    const words = match[1]
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4);
    requirementTerms.push(...words);
  }

  if (requirementTerms.length === 0) {
    return { score: 1.0, diagnostics: [] }; // No clear requirements to check
  }

  // Tokenize milestones into a Set for O(1) word lookups
  const milestoneWords = new Set(
    docs.milestones
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 0),
  );
  const found = requirementTerms.filter((t) => milestoneWords.has(t));
  const score = found.length / requirementTerms.length;

  const diagnostics: Diagnostic[] = [];
  if (score < 0.5) {
    diagnostics.push({
      axis: "consistency",
      document: "milestones",
      message: "Milestones may not adequately reference PRD requirements",
      severity: "info",
    });
  }

  return { score, diagnostics };
};

/**
 * Evaluates cross-document consistency.
 *
 * Checks:
 * - Project name consistency across all documents
 * - PRD requirements referenced in milestones
 */
export const evaluateConsistency = (
  docs: Required<GeneratedDocs>,
): AxisScore => {
  const allEmpty = Object.values(docs).every((d) => !d.trim());
  if (allEmpty) {
    return {
      axis: "consistency",
      document: "global",
      score: 0,
      diagnostics: [
        {
          axis: "consistency",
          document: "global",
          message: "All documents are empty",
          severity: "error",
        },
      ],
    };
  }

  const nameResult = checkNameConsistency(docs);
  const alignmentResult = checkPrdMilestoneAlignment(docs);

  const diagnostics = [
    ...nameResult.diagnostics,
    ...alignmentResult.diagnostics,
  ];

  // Weight: name consistency 60%, PRD-milestone alignment 40%
  const score = nameResult.score * 0.6 + alignmentResult.score * 0.4;

  return {
    axis: "consistency",
    document: "global",
    score: Math.max(0, Math.min(1, score)),
    diagnostics,
  };
};
