import type { DocumentType } from "../agent/generate/types.js";
import type { AxisScore, Diagnostic } from "./types.js";
import { extractMarkdownSection } from "./markdown.js";

/**
 * Actionability is most relevant for milestones and PRD — documents that
 * define "what to do" rather than "what this is".
 *
 * For vision and architecture, actionability is always 1.0 (not applicable).
 */
const ACTIONABLE_DOC_TYPES: ReadonlySet<DocumentType> = new Set([
  "milestones",
  "prd",
]);

/**
 * Counts numbered list items (1. 2. 3. etc.) in the content.
 */
const countNumberedItems = (content: string): number => {
  const matches = content.match(/^\d+\.\s+\S/gm);
  return matches?.length ?? 0;
};

/**
 * Counts bulleted list items in the content.
 */
const countBulletItems = (content: string): number => {
  const matches = content.match(/^[-*]\s+\S/gm);
  return matches?.length ?? 0;
};

/**
 * Checks whether the milestones document has well-structured ACs and build sequence.
 */
const evaluateMilestonesActionability = (
  content: string,
): { score: number; diagnostics: Diagnostic[] } => {
  const diagnostics: Diagnostic[] = [];
  let score = 0;

  const hasACSection = /acceptance\s+criteria/i.test(content);
  const hasBuildSequence = /build\s+sequence/i.test(content);

  if (!hasACSection) {
    diagnostics.push({
      axis: "actionability",
      document: "milestones",
      message: "Missing acceptance criteria section",
      severity: "warning",
    });
  }

  if (!hasBuildSequence) {
    diagnostics.push({
      axis: "actionability",
      document: "milestones",
      message: "Missing build sequence section",
      severity: "warning",
    });
  }

  // Count numbered ACs (good milestones have 3+ numbered criteria)
  const acContent =
    extractMarkdownSection(content, /^###?\s+acceptance\s+criteria/im) ?? "";
  const acCount = countNumberedItems(acContent);

  if (hasACSection && acCount < 3) {
    diagnostics.push({
      axis: "actionability",
      document: "milestones",
      message: `Only ${acCount} acceptance criteria found; well-scoped milestones typically have 3+`,
      severity: "info",
    });
  }

  // Count build sequence phases
  const buildContent =
    extractMarkdownSection(content, /^###?\s+build\s+sequence/im) ?? "";
  const phaseCount = countNumberedItems(buildContent);

  if (hasBuildSequence && phaseCount < 2) {
    diagnostics.push({
      axis: "actionability",
      document: "milestones",
      message: `Only ${phaseCount} build phases found; a clear build sequence has 2+ phases`,
      severity: "info",
    });
  }

  // Scoring components:
  // - Has AC section: 0.25
  // - Has build sequence: 0.25
  // - 3+ ACs: 0.25
  // - 2+ build phases: 0.25
  if (hasACSection) score += 0.25;
  if (hasBuildSequence) score += 0.25;
  if (acCount >= 3) score += 0.25;
  if (phaseCount >= 2) score += 0.25;

  return { score, diagnostics };
};

/**
 * Checks whether the PRD has concrete, testable requirements.
 * Counts list items only within requirement-oriented sections, not the whole document.
 */
const evaluatePrdActionability = (
  content: string,
): { score: number; diagnostics: Diagnostic[] } => {
  const diagnostics: Diagnostic[] = [];
  let score = 0;

  const hasRequirements = /^##\s+requirements/im.test(content);
  const hasUserJourneys = /^##\s+user\s+journeys/im.test(content);
  const hasSuccessCriteria = /^##\s+success\s+criteria/im.test(content);

  if (!hasRequirements) {
    diagnostics.push({
      axis: "actionability",
      document: "prd",
      message: "Missing requirements section",
      severity: "warning",
    });
  }

  // Count requirement items only within Requirements and NFR sections
  const reqContent =
    extractMarkdownSection(content, /^##\s+requirements/im) ?? "";
  const nfrContent =
    extractMarkdownSection(content, /^##\s+non-?functional\s+requirements/im) ??
    "";
  const scContent =
    extractMarkdownSection(content, /^##\s+success\s+criteria/im) ?? "";
  const combinedReqContent = [reqContent, nfrContent, scContent].join("\n");
  const totalItems =
    countNumberedItems(combinedReqContent) +
    countBulletItems(combinedReqContent);

  if (totalItems < 5) {
    diagnostics.push({
      axis: "actionability",
      document: "prd",
      message: `Only ${totalItems} requirement items found; a substantive PRD has 5+`,
      severity: "info",
    });
  }

  // Scoring:
  // - Has requirements section: 0.3
  // - Has user journeys: 0.2
  // - Has success criteria: 0.2
  // - 5+ requirement items: 0.3
  if (hasRequirements) score += 0.3;
  if (hasUserJourneys) score += 0.2;
  if (hasSuccessCriteria) score += 0.2;
  if (totalItems >= 5) score += 0.3;

  return { score, diagnostics };
};

/**
 * Evaluates how actionable a document is — whether it provides concrete,
 * testable criteria that a developer can work from.
 *
 * Only applies to milestones and PRD. Other document types return 1.0.
 */
export const evaluateActionability = (
  document: DocumentType,
  content: string,
): AxisScore => {
  if (!ACTIONABLE_DOC_TYPES.has(document)) {
    return { axis: "actionability", document, score: 1.0, diagnostics: [] };
  }

  if (!content.trim()) {
    return {
      axis: "actionability",
      document,
      score: 0,
      diagnostics: [
        {
          axis: "actionability",
          document,
          message: "Document is empty",
          severity: "error",
        },
      ],
    };
  }

  const result =
    document === "milestones"
      ? evaluateMilestonesActionability(content)
      : evaluatePrdActionability(content);

  return {
    axis: "actionability",
    document,
    score: result.score,
    diagnostics: result.diagnostics,
  };
};
