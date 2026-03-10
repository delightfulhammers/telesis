import type { DocumentType } from "../agent/generate/types.js";
import type { AxisScore, Diagnostic } from "./types.js";
import { extractMarkdownSection } from "./markdown.js";

/** A check that expects a markdown heading with content underneath. */
interface HeadingSpec {
  readonly kind: "heading";
  readonly pattern: RegExp;
  readonly label: string;
}

/** A check that expects an inline field (e.g. **Goal:**) with a value on the same line. */
interface InlineFieldSpec {
  readonly kind: "inline";
  readonly pattern: RegExp;
  readonly label: string;
}

type SectionSpec = HeadingSpec | InlineFieldSpec;

const VISION_SECTIONS: readonly SectionSpec[] = [
  { kind: "heading", pattern: /^##\s+the\s+problem/im, label: "The Problem" },
  { kind: "heading", pattern: /^##\s+the\s+vision/im, label: "The Vision" },
  { kind: "heading", pattern: /^##\s+principles/im, label: "Principles" },
  {
    kind: "heading",
    pattern: /^##\s+what\s+this\s+is/im,
    label: "What This Is / What This Isn't",
  },
];

const PRD_SECTIONS: readonly SectionSpec[] = [
  { kind: "heading", pattern: /^##\s+overview/im, label: "Overview" },
  {
    kind: "heading",
    pattern: /^##\s+user\s+journeys/im,
    label: "User Journeys",
  },
  { kind: "heading", pattern: /^##\s+requirements/im, label: "Requirements" },
  {
    kind: "heading",
    pattern: /^##\s+non-?functional\s+requirements/im,
    label: "Non-functional Requirements",
  },
  {
    kind: "heading",
    pattern: /^##\s+success\s+criteria/im,
    label: "Success Criteria",
  },
];

const ARCHITECTURE_SECTIONS: readonly SectionSpec[] = [
  {
    kind: "heading",
    pattern: /^##\s+system\s+overview/im,
    label: "System Overview",
  },
  { kind: "heading", pattern: /^##\s+components/im, label: "Components" },
  { kind: "heading", pattern: /^##\s+data\s+flow/im, label: "Data Flow" },
  {
    kind: "heading",
    pattern: /^##\s+working\s+conventions/im,
    label: "Working Conventions",
  },
  {
    kind: "heading",
    pattern: /^##\s+key\s+decisions/im,
    label: "Key Decisions",
  },
];

const MILESTONES_SECTIONS: readonly SectionSpec[] = [
  { kind: "inline", pattern: /\*\*goal:\*\*\s*\S/im, label: "Goal" },
  { kind: "inline", pattern: /\*\*status:\*\*\s*\S/im, label: "Status" },
  {
    kind: "heading",
    pattern: /^###?\s+acceptance\s+criteria/im,
    label: "Acceptance Criteria",
  },
  {
    kind: "heading",
    pattern: /^###?\s+build\s+sequence/im,
    label: "Build Sequence",
  },
  {
    kind: "heading",
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
 * Checks whether a spec is present and has substantive content.
 */
const checkSpec = (
  spec: SectionSpec,
  content: string,
): { present: boolean; hasContent: boolean } => {
  if (!spec.pattern.test(content)) {
    return { present: false, hasContent: false };
  }

  if (spec.kind === "inline") {
    // Inline fields like **Goal:** are validated by the regex itself —
    // the pattern requires non-whitespace after the field label.
    return { present: true, hasContent: true };
  }

  // Heading-based: check that section body has real content
  const sectionContent = extractMarkdownSection(content, spec.pattern);
  return {
    present: true,
    hasContent: !!sectionContent && sectionContent.length >= 10,
  };
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
    const result = checkSpec(spec, content);
    if (result.present) {
      if (result.hasContent) {
        present++;
      } else {
        diagnostics.push({
          axis: "completeness",
          document,
          message: `Section "${spec.label}" is present but empty or too short`,
          severity: "warning",
        });
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
