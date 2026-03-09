export type DocumentType = "vision" | "prd" | "architecture" | "milestones";

export interface GeneratedDocs {
  readonly vision?: string;
  readonly prd?: string;
  readonly architecture?: string;
  readonly milestones?: string;
}

export const DOCUMENT_ORDER: readonly DocumentType[] = [
  "vision",
  "prd",
  "architecture",
  "milestones",
];

export const DOCUMENT_PATHS: Readonly<Record<DocumentType, string>> = {
  vision: "docs/VISION.md",
  prd: "docs/PRD.md",
  architecture: "docs/ARCHITECTURE.md",
  milestones: "docs/MILESTONES.md",
};
