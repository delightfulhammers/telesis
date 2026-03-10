import { DOCUMENT_ORDER } from "../agent/generate/types.js";
import type { DocumentType, GeneratedDocs } from "../agent/generate/types.js";
import type {
  Diagnostic,
  DocumentScore,
  EvalInput,
  EvalReport,
  QualityAxis,
} from "./types.js";
import { evaluateStructure } from "./structural.js";
import { evaluateCoverage } from "./coverage.js";
import { evaluateSpecificity } from "./specificity.js";
import { evaluateConsistency } from "./consistency.js";
import { evaluateActionability } from "./actionability.js";

const QUALITY_AXES: readonly QualityAxis[] = [
  "completeness",
  "coverage",
  "specificity",
  "consistency",
  "actionability",
];

/**
 * Runs all evaluators against the generated documents and produces a
 * structured report.
 *
 * Each document gets scores on every quality axis. The overall score
 * is the average across all documents.
 */
export const evaluate = (input: EvalInput): EvalReport => {
  const { interviewState, generatedDocs } = input;
  const docs = generatedDocs as Required<GeneratedDocs>;

  // Cross-document evaluations (run once, apply to all docs)
  const coverageResult = evaluateCoverage(interviewState, docs);
  const consistencyResult = evaluateConsistency(docs);

  // Per-document evaluations
  const documentScores: DocumentScore[] = DOCUMENT_ORDER.map(
    (docType: DocumentType) => {
      const content = docs[docType] ?? "";

      const structuralResult = evaluateStructure(docType, content);
      const specificityResult = evaluateSpecificity(docType, content);
      const actionabilityResult = evaluateActionability(docType, content);

      const axes: Record<QualityAxis, number> = {
        completeness: structuralResult.score,
        coverage: coverageResult.score,
        specificity: specificityResult.score,
        consistency: consistencyResult.score,
        actionability: actionabilityResult.score,
      };

      const diagnostics: Diagnostic[] = [
        ...structuralResult.diagnostics.map((d) => ({
          ...d,
          document: docType,
        })),
        ...specificityResult.diagnostics.map((d) => ({
          ...d,
          document: docType,
        })),
        ...actionabilityResult.diagnostics.map((d) => ({
          ...d,
          document: docType,
        })),
      ];

      const axisValues = Object.values(axes);
      const overall =
        axisValues.reduce((sum, v) => sum + v, 0) / axisValues.length;

      return { document: docType, overall, axes, diagnostics };
    },
  );

  // Collect cross-document diagnostics separately
  const crossDocDiagnostics: Diagnostic[] = [
    ...coverageResult.diagnostics,
    ...consistencyResult.diagnostics,
  ];

  const allDiagnostics = [
    ...documentScores.flatMap((ds) => ds.diagnostics),
    ...crossDocDiagnostics,
  ];

  const overall =
    documentScores.reduce((sum, ds) => sum + ds.overall, 0) /
    documentScores.length;

  return {
    documents: documentScores,
    overall,
    diagnostics: allDiagnostics,
  };
};
