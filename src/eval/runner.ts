import { DOCUMENT_ORDER } from "../agent/generate/types.js";
import type { DocumentType, GeneratedDocs } from "../agent/generate/types.js";
import type {
  Diagnostic,
  DocumentScore,
  EvalInput,
  EvalReport,
  PerDocumentAxis,
} from "./types.js";
import { evaluateStructure } from "./structural.js";
import { evaluateCoverage } from "./coverage.js";
import { evaluateSpecificity } from "./specificity.js";
import { evaluateConsistency } from "./consistency.js";
import { evaluateActionability } from "./actionability.js";

const PER_DOC_AXES: readonly PerDocumentAxis[] = [
  "completeness",
  "specificity",
  "actionability",
];

/**
 * Runs all evaluators against the generated documents and produces a
 * structured report.
 *
 * Per-document axes (completeness, specificity, actionability) are scored
 * independently for each document. Cross-document axes (coverage, consistency)
 * are scored once globally and reported separately.
 */
export const evaluate = (input: EvalInput): EvalReport => {
  const { interviewState, generatedDocs } = input;
  const docs = generatedDocs as Required<GeneratedDocs>;

  // Cross-document evaluations (run once, reported globally)
  const coverageResult = evaluateCoverage(interviewState, docs);
  const consistencyResult = evaluateConsistency(docs);

  // Per-document evaluations
  const documentScores: DocumentScore[] = DOCUMENT_ORDER.map(
    (docType: DocumentType) => {
      const content = docs[docType] ?? "";

      const structuralResult = evaluateStructure(docType, content);
      const specificityResult = evaluateSpecificity(docType, content);
      const actionabilityResult = evaluateActionability(docType, content);

      const axes: Record<PerDocumentAxis, number> = {
        completeness: structuralResult.score,
        specificity: specificityResult.score,
        actionability: actionabilityResult.score,
      };

      const diagnostics: Diagnostic[] = [
        ...structuralResult.diagnostics.map((d) => ({
          ...d,
          document: docType as DocumentType,
        })),
        ...specificityResult.diagnostics.map((d) => ({
          ...d,
          document: docType as DocumentType,
        })),
        ...actionabilityResult.diagnostics.map((d) => ({
          ...d,
          document: docType as DocumentType,
        })),
      ];

      const axisValues = Object.values(axes);
      const overall =
        axisValues.reduce((sum, v) => sum + v, 0) / axisValues.length;

      return { document: docType, overall, axes, diagnostics };
    },
  );

  const globalAxes = {
    coverage: coverageResult,
    consistency: consistencyResult,
  };

  const allDiagnostics = [
    ...documentScores.flatMap((ds) => ds.diagnostics),
    ...coverageResult.diagnostics,
    ...consistencyResult.diagnostics,
  ];

  // Overall: weighted average of per-document scores (60%) and global axes (40%)
  const docAvg =
    documentScores.length > 0
      ? documentScores.reduce((sum, ds) => sum + ds.overall, 0) /
        documentScores.length
      : 0;
  const globalAvg = (coverageResult.score + consistencyResult.score) / 2;
  const overall = docAvg * 0.6 + globalAvg * 0.4;

  return {
    documents: documentScores,
    globalAxes,
    overall,
    diagnostics: allDiagnostics,
  };
};
