import type { PersonaDefinition, ReviewContext } from "./types.js";

const RESPONSE_FORMAT = `## Response Format

Return a JSON array of findings. Each finding must have these fields:

- "severity": one of "critical", "high", "medium", "low"
- "category": one of "bug", "security", "architecture", "maintainability", "performance", "style"
- "path": the file path from the diff
- "startLine": the line number where the issue starts (from the diff's +line numbers), or null if not applicable
- "endLine": the line number where the issue ends, or null
- "description": a concise description of the problem (1-2 sentences)
- "suggestion": a concrete suggestion for how to fix it (not just "fix this")

If there are no findings, return an empty array: []

Return ONLY the JSON array. No markdown fences, no explanation text, no preamble.`;

const SEVERITY_GUIDELINES = `## Severity Guidelines

- **critical**: Will cause data loss, security breach, or crash in production
- **high**: Bug that will cause incorrect behavior, or significant architecture violation
- **medium**: Maintainability concern, minor convention violation, potential edge case
- **low**: Style nit, minor improvement suggestion`;

const SINGLE_PASS_PREAMBLE = `Your job is to review a code diff against the project's own conventions, architecture rules, and design decisions. Focus on:

1. **Correctness** — bugs, logic errors, off-by-one errors, null/undefined risks
2. **Security** — injection, unsafe input handling, secrets exposure
3. **Architecture** — violations of documented rules, import discipline, package boundaries
4. **Maintainability** — complexity, unclear naming, missing error handling
5. **Performance** — obvious inefficiencies (not micro-optimizations)
6. **Style** — violations of documented conventions`;

const formatThemesSection = (themes: readonly string[]): string => {
  if (themes.length === 0) return "";

  const themeList = themes.map((t) => `- ${t}`).join("\n");
  return `\n\n## Previously Identified Themes

The following issues have been identified in prior reviews. Do not re-report these unless the same issue appears in NEW code introduced by this diff:

${themeList}`;
};

const formatFocusSection = (persona: PersonaDefinition): string => {
  const parts: string[] = [];

  if (persona.focusCategories.length > 0) {
    parts.push(`Focus primarily on: ${persona.focusCategories.join(", ")}.`);
  }
  if (persona.ignoreCategories.length > 0) {
    parts.push(`You may skip: ${persona.ignoreCategories.join(", ")}.`);
  }

  return parts.length > 0 ? "\n\n" + parts.join(" ") : "";
};

export const buildSinglePassPrompt = (
  context: ReviewContext,
  themes: readonly string[] = [],
): string =>
  `You are a code reviewer for the ${context.projectName} project (${context.primaryLanguage}).

${SINGLE_PASS_PREAMBLE}

## Project Review Criteria

${context.conventions}

${RESPONSE_FORMAT}

${SEVERITY_GUIDELINES}${formatThemesSection(themes)}`;

export const buildPersonaSystemPrompt = (
  persona: PersonaDefinition,
  context: ReviewContext,
  themes: readonly string[] = [],
): string =>
  `You are the ${persona.name} for the ${context.projectName} project (${context.primaryLanguage}).

${persona.preamble}${formatFocusSection(persona)}

## Project Review Criteria

${context.conventions}

${RESPONSE_FORMAT}

${SEVERITY_GUIDELINES}${formatThemesSection(themes)}`;

export const buildUserMessage = (
  diff: string,
  fileList: string,
): string => `## Changed Files

${fileList}

## Diff

\`\`\`diff
${diff}
\`\`\`

Review this diff against the project conventions provided in the system prompt. Return your findings as a JSON array.`;

export const buildDedupPrompt = (
  candidates: readonly {
    readonly id: string;
    readonly persona: string;
    readonly severity: string;
    readonly category: string;
    readonly path: string;
    readonly description: string;
    readonly suggestion: string;
  }[],
): string => `You are a deduplication engine. Given a list of code review findings from multiple reviewers, identify which findings describe the SAME underlying issue.

## Findings

${JSON.stringify(candidates, null, 2)}

## Instructions

Group findings that describe the same issue. For each group, return the finding ID that best represents the issue (prefer the higher severity).

Return a JSON array of groups. Each group is an object with:
- "keepId": the ID of the finding to keep
- "duplicateIds": array of IDs that are duplicates of the kept finding

Findings that are unique (no duplicates) should NOT appear in the output.

If there are no duplicates, return an empty array: []

Return ONLY the JSON array. No markdown fences, no explanation text, no preamble.`;

export const buildThemeExtractionPrompt = (
  findings: readonly {
    readonly severity: string;
    readonly category: string;
    readonly path: string;
    readonly description: string;
  }[],
): string => `Extract the key themes from these code review findings. A theme is a short summary (5-10 words) of a recurring concern or specific issue that was identified.

## Findings

${JSON.stringify(findings, null, 2)}

## Instructions

Return a JSON array of theme strings. Each theme should be specific enough to identify the issue if it appears again (e.g., "path traversal via session ID validation" not just "security").

Extract at most 10 themes. Focus on the most significant findings.

Return ONLY the JSON array. No markdown fences, no explanation text, no preamble.`;
