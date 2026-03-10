import type { DocumentType } from "../agent/generate/types.js";
import type { AxisScore, Diagnostic } from "./types.js";

/** Expected section headings per document type. */
interface SectionSpec {
  readonly pattern: RegExp;
  readonly label: string;
}

const VISION_SECTIONS: readonly SectionSpec[] = [
  { pattern: /^##\s+the\s+problem/im, label: "The Problem" },
  { pattern: /^##\s+the\s+vision/im, label: "The Vision" },
  { pattern: /^##\s+principles/im, label: "Principles" },
  {
    pattern: /^##\s+what\s+this\s+is/im,
    label: "What This Is / What This Isn't",
  },
];

const PRD_SECTIONS: readonly SectionSpec[] = [
  { pattern: /^##\s+overview/im, label: "Overview" },
  { pattern: /^##\s+user\s+journeys/im, label: "User Journeys" },
  { pattern: /^##\s+requirements/im, label: "Requirements" },
  {
    pattern: /^##\s+non-?functional\s+requirements/im,
    label: "Non-functional Requirements",
  },
  { pattern: /^##\s+success\s+criteria/im, label: "Success Criteria" },
];

const ARCHITECTURE_SECTIONS: readonly SectionSpec[] = [
  { pattern: /^##\s+system\s+overview/im, label: "System Overview" },
  { pattern: /^##\s+components/im, label: "Components" },
  { pattern: /^##\s+data\s+flow/im, label: "Data Flow" },
  { pattern: /^##\s+working\s+conventions/im, label: "Working Conventions" },
  { pattern: /^##\s+key\s+decisions/im, label: "Key Decisions" },
];

const MILESTONES_SECTIONS: readonly SectionSpec[] = [
  { pattern: /\*\*goal:\*\*/im, label: "Goal" },
  { pattern: /\*\*status:\*\*/im, label: "Status" },
  {
    pattern: /^###?\s+acceptance\s+criteria/im,
    label: "Acceptance Criteria",
  },
  { pattern: /^###?\s+build\s+sequence/im, label: "Build Sequence" },
  {
    pattern: /^##\s+future\s+milestones/im,
    label: "Future Milestones",
  },
];

const SECTION_SPECS: Readonly<Record<DocumentType, readonly SectionSpec[]>> = {
  vision: VISION_SECTIONS,
  prd: PRD_SECTIONS,
  architecture: ARCHITECTURE_SECTIONS,
  milestones: MILESTONES_SECTIONS,
};

/**
 * Extracts the content under a heading by finding text between the heading
 * match and the next heading of equal or higher level (or end of document).
 */
const extractSectionContent = (
  content: string,
  pattern: RegExp,
): string | null => {
  const match = pattern.exec(content);
  if (!match) return null;

  const headingLine = content.substring(match.index);
  const headingLevel = (headingLine.match(/^(#+)/) ?? ["", "##"])[1].length;

  // Find the next heading of equal or higher level
  const afterHeading = content.substring(match.index + match[0].length);
  const nextHeadingPattern = new RegExp(`^#{1,${headingLevel}}\\s`, "m");
  const nextMatch = nextHeadingPattern.exec(afterHeading);

  const sectionBody = nextMatch
    ? afterHeading.substring(0, nextMatch.index)
    : afterHeading;

  return sectionBody.trim();
};

/**
 * Evaluates whether a document has the expected structural sections
 * and whether those sections contain substantive content.
 */
export const evaluateStructure = (
  document: DocumentType,
  content: string,
): AxisScore => {
  const specs = SECTION_SPECS[document];
  const diagnostics: Diagnostic[] = [];

  if (!content.trim()) {
    diagnostics.push({
      axis: "completeness",
      document,
      message: "Document is empty",
      severity: "error",
    });
    return { axis: "completeness", document, score: 0, diagnostics };
  }

  let present = 0;

  for (const spec of specs) {
    if (spec.pattern.test(content)) {
      // Check if the section has substantive content
      const sectionContent = extractSectionContent(content, spec.pattern);
      if (!sectionContent || sectionContent.length < 10) {
        diagnostics.push({
          axis: "completeness",
          document,
          message: `Section "${spec.label}" is present but empty or too short`,
          severity: "warning",
        });
      } else {
        present++;
      }
    } else {
      diagnostics.push({
        axis: "completeness",
        document,
        message: `Missing expected section: "${spec.label}"`,
        severity: "warning",
      });
    }
  }

  const score = specs.length > 0 ? present / specs.length : 0;
  return { axis: "completeness", document, score, diagnostics };
};
