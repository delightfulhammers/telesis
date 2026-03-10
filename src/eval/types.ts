import type { DocumentType, GeneratedDocs } from "../agent/generate/types.js";
import type { InterviewState } from "../agent/interview/state.js";

/** Quality axes evaluated per document. */
export type PerDocumentAxis = "completeness" | "specificity" | "actionability";

/** Quality axes evaluated across all documents (global scope). */
export type GlobalAxis = "coverage" | "consistency";

/** All quality axes. */
export type QualityAxis = PerDocumentAxis | GlobalAxis;

/** A single diagnostic note from an evaluator. */
export interface Diagnostic {
  readonly axis: QualityAxis;
  readonly document: DocumentType | "global";
  readonly message: string;
  readonly severity: "info" | "warning" | "error";
}

/** Score for a single quality axis on a single document. 0-1 scale. */
export interface AxisScore {
  readonly axis: QualityAxis;
  readonly document: DocumentType | "global";
  readonly score: number;
  readonly diagnostics: readonly Diagnostic[];
}

/** Aggregate score for a single document across its per-document axes. */
export interface DocumentScore {
  readonly document: DocumentType;
  readonly overall: number;
  readonly axes: Readonly<Record<PerDocumentAxis, number>>;
  readonly diagnostics: readonly Diagnostic[];
}

/** Scores for cross-document quality axes. */
export interface GlobalAxisScores {
  readonly coverage: AxisScore;
  readonly consistency: AxisScore;
}

/** Full evaluation report. */
export interface EvalReport {
  readonly documents: readonly DocumentScore[];
  readonly globalAxes: GlobalAxisScores;
  readonly overall: number;
  readonly diagnostics: readonly Diagnostic[];
}

/** Input to the evaluation suite. */
export interface EvalInput {
  readonly interviewState: InterviewState;
  readonly generatedDocs: Required<GeneratedDocs>;
}
