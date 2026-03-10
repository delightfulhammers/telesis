import type { DocumentType } from "../agent/generate/types.js";
import type { AxisScore, Diagnostic } from "./types.js";

/**
 * Phrases that signal generic boilerplate rather than project-specific content.
 * Weighted by how strongly they indicate genericness.
 */
interface GenericSignal {
  readonly pattern: RegExp;
  readonly label: string;
  readonly weight: number;
}

const GENERIC_SIGNALS: readonly GenericSignal[] = [
  // Generic principle language
  {
    pattern: /put\s+the\s+user\s+first/i,
    label: "generic principle: user-first",
    weight: 1,
  },
  {
    pattern: /user[- ]centric/i,
    label: "generic principle: user-centric",
    weight: 1,
  },
  {
    pattern: /design\s+for\s+(scale|growth)/i,
    label: "generic principle: design for scale",
    weight: 1,
  },
  {
    pattern: /build\s+for\s+(scale|growth)/i,
    label: "generic principle: build for scale",
    weight: 1,
  },
  {
    pattern: /security\s+by\s+design/i,
    label: "generic principle: security by design",
    weight: 1,
  },
  {
    pattern: /clean[,\s]+well[- ]documented\s+code/i,
    label: "generic principle: clean code",
    weight: 1,
  },
  {
    pattern: /industry\s+best\s+practices/i,
    label: "generic: industry best practices",
    weight: 1,
  },
  {
    pattern: /follow\s+(security\s+)?best\s+practices/i,
    label: "generic: follow best practices",
    weight: 1,
  },
  {
    pattern: /modern[,\s]+(scalable|robust)/i,
    label: "generic: modern scalable",
    weight: 0.8,
  },
  {
    pattern: /write\s+clean/i,
    label: "generic: write clean code",
    weight: 0.8,
  },

  // Generic problem statements
  {
    pattern: /users\s+face\s+challenges/i,
    label: "generic problem: users face challenges",
    weight: 1,
  },
  {
    pattern: /current\s+solutions\s+are\s+(inadequate|insufficient)/i,
    label: "generic problem: current solutions inadequate",
    weight: 1,
  },
  {
    pattern: /don'?t\s+meet\s+their\s+needs/i,
    label: "generic problem: don't meet needs",
    weight: 0.8,
  },

  // Generic vision statements
  {
    pattern: /delivers?\s+value/i,
    label: "generic vision: delivers value",
    weight: 0.8,
  },
  {
    pattern: /addresses?\s+user\s+needs/i,
    label: "generic vision: addresses user needs",
    weight: 0.8,
  },
  {
    pattern: /seamless\s+experience/i,
    label: "generic: seamless experience",
    weight: 0.6,
  },
  {
    pattern: /comprehensive\s+solution/i,
    label: "generic: comprehensive solution",
    weight: 0.6,
  },
  {
    pattern: /streamline[sd]?\s+(the\s+)?(workflow|process)/i,
    label: "generic: streamline workflow",
    weight: 0.6,
  },

  // Generic architecture language
  {
    pattern: /handle[sd]?\s+various\s+responsibilities/i,
    label: "generic arch: various responsibilities",
    weight: 0.8,
  },
  {
    pattern: /in\s+a\s+scalable\s+and\s+maintainable\s+way/i,
    label: "generic arch: scalable and maintainable way",
    weight: 1,
  },
];

/**
 * Signals that indicate project-specific content. Their presence offsets
 * generic signals.
 */
const SPECIFIC_SIGNALS: readonly RegExp[] = [
  // Named technologies (not just "technology" or "framework")
  /\b(react|vue|angular|svelte|next\.?js|express|fastify|django|flask|rails|spring|laravel)\b/i,
  /\b(postgres|mysql|mongodb|redis|sqlite|dynamodb|firebase)\b/i,
  /\b(graphql|grpc|rest\s+api|websocket)\b/i,
  /\b(docker|kubernetes|aws|gcp|azure|vercel|cloudflare)\b/i,
  /\b(typescript|python|rust|go|java|kotlin|swift)\b/i,

  // Concrete domain terms (3+ word specific phrases)
  /\b\w+\s+\w+\s+(api|service|engine|manager|handler|controller|pipeline)\b/i,

  // Specific numbers/metrics
  /\b\d+\s*(ms|seconds?|minutes?|hours?|MB|GB|requests?\/s|users?|items?)\b/i,

  // File paths or code references
  /`[a-z][a-z0-9_/.-]+`/i,

  // Specific architectural patterns
  /\b(event[- ]sourcing|cqrs|saga\s+pattern|circuit\s+breaker|pub[/-]sub)\b/i,
];

/**
 * Splits document content into sections based on markdown headings.
 */
const splitSections = (content: string): readonly string[] => {
  const sections = content.split(/^#{1,3}\s+/m).filter((s) => s.trim());
  return sections.length > 0 ? sections : [content];
};

/**
 * Evaluates how project-specific (vs generic boilerplate) the content is.
 *
 * Scores each section of the document by checking for generic vs specific
 * signals, then averages across sections.
 */
export const evaluateSpecificity = (
  document: DocumentType,
  content: string,
): AxisScore => {
  if (!content.trim()) {
    return {
      axis: "specificity",
      document,
      score: 0,
      diagnostics: [
        {
          axis: "specificity",
          document,
          message: "Document is empty — cannot assess specificity",
          severity: "error",
        },
      ],
    };
  }

  const diagnostics: Diagnostic[] = [];
  const sections = splitSections(content);

  let totalGenericWeight = 0;
  let totalSpecificHits = 0;

  // Count generic signals across the whole document
  for (const signal of GENERIC_SIGNALS) {
    if (signal.pattern.test(content)) {
      totalGenericWeight += signal.weight;
      diagnostics.push({
        axis: "specificity",
        document,
        message: `Generic language detected: "${signal.label}"`,
        severity: "warning",
      });
    }
  }

  // Count specific signals across the whole document
  for (const pattern of SPECIFIC_SIGNALS) {
    if (pattern.test(content)) {
      totalSpecificHits++;
    }
  }

  // Named entity check: capitalized multi-word terms in body text (not headings)
  const bodyText = content
    .split("\n")
    .filter((line) => !/^#+\s/.test(line))
    .join("\n");
  if (/(?:^|\s)[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+(?=\s|[,.])/.test(bodyText)) {
    totalSpecificHits++;
  }

  // Score: specific signals offset generic ones.
  // Base score starts at 1.0, reduced by generic signals, boosted by specific ones.
  // Each generic signal deducts 0.15, each specific signal adds 0.1.
  const genericPenalty = totalGenericWeight * 0.15;
  const specificBonus = totalSpecificHits * 0.1;

  // Also penalize if content is very short per section (likely skeleton)
  const avgSectionLength =
    sections.reduce((sum, s) => sum + s.trim().length, 0) / sections.length;
  const lengthPenalty = avgSectionLength < 50 ? 0.3 : 0;

  if (lengthPenalty > 0) {
    diagnostics.push({
      axis: "specificity",
      document,
      message: "Sections are very short — may lack substantive detail",
      severity: "info",
    });
  }

  const rawScore = 1.0 - genericPenalty + specificBonus - lengthPenalty;
  const score = Math.max(0, Math.min(1, rawScore));

  return { axis: "specificity", document, score, diagnostics };
};
