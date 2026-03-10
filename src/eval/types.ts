import type { DocumentType, GeneratedDocs } from "../agent/generate/types.js";
import type { InterviewState } from "../agent/interview/state.js";

/** A quality axis that documents are scored on. */
export type QualityAxis =
  | "completeness"
  | "coverage"
  | "specificity"
  | "consistency"
  | "actionability";

/** A single diagnostic note from an evaluator. */
export interface Diagnostic {
  readonly axis: QualityAxis;
  readonly document: DocumentType;
  readonly message: string;
  readonly severity: "info" | "warning" | "error";
}

/** Score for a single quality axis on a single document. 0-1 scale. */
export interface AxisScore {
  readonly axis: QualityAxis;
  readonly document: DocumentType;
  readonly score: number;
  readonly diagnostics: readonly Diagnostic[];
}

/** Aggregate score for a single document across all axes. */
export interface DocumentScore {
  readonly document: DocumentType;
  readonly overall: number;
  readonly axes: Readonly<Record<QualityAxis, number>>;
  readonly diagnostics: readonly Diagnostic[];
}

/** Full evaluation report. */
export interface EvalReport {
  readonly documents: readonly DocumentScore[];
  readonly overall: number;
  readonly diagnostics: readonly Diagnostic[];
}

/** Input to the evaluation suite. */
export interface EvalInput {
  readonly interviewState: InterviewState;
  readonly generatedDocs: Required<GeneratedDocs>;
}
