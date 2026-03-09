import type { InterviewState } from "../interview/state.js";
import type { DocumentType, GeneratedDocs } from "./types.js";

const formatConversation = (state: InterviewState): string =>
  state.turns
    .map(
      (t) => `${t.role === "user" ? "Developer" : "Interviewer"}: ${t.content}`,
    )
    .join("\n\n");

const formatPreviousDocs = (docs: GeneratedDocs): string => {
  const sections: string[] = [];
  if (docs.vision)
    sections.push(`## Previously generated: VISION.md\n\n${docs.vision}`);
  if (docs.prd) sections.push(`## Previously generated: PRD.md\n\n${docs.prd}`);
  if (docs.architecture)
    sections.push(
      `## Previously generated: ARCHITECTURE.md\n\n${docs.architecture}`,
    );
  if (docs.milestones)
    sections.push(
      `## Previously generated: MILESTONES.md\n\n${docs.milestones}`,
    );
  return sections.length > 0 ? sections.join("\n\n---\n\n") : "";
};

const DOCUMENT_PROMPTS: Readonly<Record<DocumentType, string>> = {
  vision: `You are generating a VISION.md document for a software project.

## Purpose
VISION.md captures the project's foundational "why" — its purpose, the problem it solves, and the principles that guide its development. It is the document that new contributors read first.

## Expected structure
1. **Title and tagline** — project name and one-sentence description
2. **The Problem** — what pain point or gap this project addresses
3. **The Vision** — what the world looks like when this project succeeds
4. **Principles** — 4-6 guiding principles that shape design decisions
5. **What This Is / What This Isn't** — clear scope boundaries

## Instructions
- Write substantive content, not placeholders or skeletons
- Use clear, direct language — no marketing fluff
- Ground everything in the interview conversation
- Return ONLY the markdown document, no preamble or explanation`,

  prd: `You are generating a PRD.md (Product Requirements Document) for a software project.

## Purpose
PRD.md defines what the project does from a user's perspective — the requirements, user journeys, and success criteria.

## Expected structure
1. **Overview** — one-paragraph summary
2. **User Journeys** — 2-4 key workflows described step by step
3. **Requirements** — grouped by feature area, with clear acceptance criteria
4. **Non-functional Requirements** — performance, security, reliability constraints
5. **Success Criteria** — measurable outcomes that define "done"

## Instructions
- Write substantive content, not placeholders or skeletons
- Requirements should be specific and testable
- Reference the VISION.md for alignment on purpose and principles
- Return ONLY the markdown document, no preamble or explanation`,

  architecture: `You are generating an ARCHITECTURE.md document for a software project.

## Purpose
ARCHITECTURE.md describes how the system is built — its components, their relationships, data flow, and the conventions that keep the codebase coherent.

## Expected structure
1. **System Overview** — high-level architecture diagram description
2. **Components** — each major component with its responsibility
3. **Data Flow** — how data moves through the system
4. **Working Conventions** — code organization, naming, testing patterns
5. **Key Decisions** — important architectural choices and their rationale

## Instructions
- Write substantive content, not placeholders or skeletons
- Be specific about technology choices, patterns, and conventions
- Reference VISION.md for principles and PRD.md for requirements
- Return ONLY the markdown document, no preamble or explanation`,

  milestones: `You are generating a MILESTONES.md document for a software project.

## Purpose
MILESTONES.md defines the development roadmap — what gets built in what order, with clear acceptance criteria for each milestone.

## Expected structure
1. **Current Milestone** — marked with status, goal, acceptance criteria, build sequence
2. **Future Milestones** — 2-4 subsequent milestones with goals and rough scope
3. Each milestone should have:
   - **Goal** — one sentence on what this milestone achieves
   - **Acceptance Criteria** — numbered, testable criteria
   - **Build Sequence** — ordered phases within the milestone

## Instructions
- Write substantive content, not placeholders or skeletons
- Make the first milestone achievable and well-scoped
- Acceptance criteria should be specific and testable
- Reference all previously generated documents for context
- Return ONLY the markdown document, no preamble or explanation`,
};

export const buildGenerationPrompt = (
  docType: DocumentType,
  state: InterviewState,
  previousDocs: GeneratedDocs,
): string => {
  const parts = [DOCUMENT_PROMPTS[docType]];

  parts.push(
    `\n\n## Project context (from developer interview)\n\n${formatConversation(state)}`,
  );

  const prevDocsSection = formatPreviousDocs(previousDocs);
  if (prevDocsSection) {
    parts.push(`\n\n---\n\n${prevDocsSection}`);
  }

  return parts.join("");
};
