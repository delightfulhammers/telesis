import type {
  PersonaDefinition,
  ReviewContext,
  ReviewFinding,
  ThemeConclusion,
} from "./types.js";

const RESPONSE_FORMAT = `## Response Format

Return a JSON array of findings. Each finding must have these fields:

- "severity": one of "critical", "high", "medium", "low"
- "category": one of "bug", "security", "architecture", "maintainability", "performance", "style"
- "path": the file path from the diff
- "startLine": the line number where the issue starts (from the diff's +line numbers), or null if not applicable
- "endLine": the line number where the issue ends, or null
- "description": a concise description of the problem (1-2 sentences)
- "suggestion": a concrete suggestion for how to fix it (not just "fix this")
- "confidence": your confidence (0-100) that this is a real, actionable issue

If there are no findings, return an empty array: []

Return ONLY the JSON array. No markdown fences, no explanation text, no preamble.`;

const SEVERITY_GUIDELINES = `## Severity Guidelines

- **critical**: Will cause data loss, security breach, or crash in production
- **high**: Bug that will cause incorrect behavior, or significant architecture violation
- **medium**: Documented convention violation with specific rule reference, or edge case with concrete trigger scenario
- **low**: Style nit with specific documented convention reference`;

const CONFIDENCE_GUIDELINES = `## Confidence Scoring

Rate your confidence that each finding is a real, actionable issue:

- **90-100**: Definitively confirmed — you can see the exact bug/violation in the diff
- **70-89**: Very likely — strong evidence from code patterns and project conventions
- **50-69**: Plausible but uncertain — depends on runtime behavior or context you can't see
- **Below 50**: Speculative — do not report findings below 50 confidence`;

const ANTI_PATTERNS = `## What NOT to Report

Do NOT report findings that match these patterns — they are noise, not signal:

- **Hedging**: "This is correct, but consider..." — if the code is correct, don't report it
- **Self-dismissing**: "No action needed" or "this is fine as-is" — if no action is needed, it's not a finding
- **Speculative edge cases**: "What if someone passes X?" without evidence it can happen
- **Over-engineering**: Suggesting abstractions, interfaces, or config for one-time code
- **Style preferences**: Naming opinions, formatting choices, comment suggestions that aren't documented conventions
- **Redundant safety**: Suggesting null checks where the type system already prevents null
- **Documented intentional patterns**: If the code follows a pattern documented in the project conventions, don't suggest alternatives`;

const SINGLE_PASS_PREAMBLE = `Your job is to review a code diff against the project's own conventions, architecture rules, and design decisions. Focus on:

1. **Correctness** — bugs, logic errors, off-by-one errors, null/undefined risks
2. **Security** — injection, unsafe input handling, secrets exposure
3. **Architecture** — violations of documented rules, import discipline, package boundaries
4. **Maintainability** — complexity, unclear naming, missing error handling
5. **Performance** — obvious inefficiencies (not micro-optimizations)
6. **Style** — violations of documented conventions`;

const formatThemesSection = (
  themes: readonly string[],
  conclusions: readonly ThemeConclusion[] = [],
): string => {
  if (themes.length === 0 && conclusions.length === 0) return "";

  const parts: string[] = [];
  parts.push(`\n\n## Previously Resolved Issues

The following issues have been reviewed and resolved. Do NOT re-report them or semantic variations of them:`);

  // Render structured conclusions first (more specific)
  for (const c of conclusions) {
    parts.push(`
### ${c.theme}
**Conclusion:** ${c.conclusion}
**Do NOT suggest:** ${c.antiPattern}`);
  }

  // Render bare themes that don't have a corresponding conclusion.
  // Only suppress a bare theme when it is a substring of a conclusion theme
  // (e.g., bare "redirect prevention" is covered by conclusion "redirect prevention
  // in HTTP calls"). The reverse direction (conclusion is substring of bare) is NOT
  // checked — short conclusion themes like "error" should not suppress unrelated
  // bare themes that happen to contain that word.
  const concludedThemesLower = conclusions.map((c) => c.theme.toLowerCase());
  const bareThemes = themes.filter((t) => {
    const lower = t.toLowerCase();
    return !concludedThemesLower.some(
      (ct) => ct === lower || ct.includes(lower),
    );
  });
  if (bareThemes.length > 0) {
    parts.push("\n" + bareThemes.map((t) => `- ${t}`).join("\n"));
  }

  return parts.join("\n");
};

const formatFindingLocation = (f: ReviewFinding): string => {
  if (f.startLine !== undefined) {
    return f.endLine !== undefined && f.endLine !== f.startLine
      ? `${f.path}:${f.startLine}-${f.endLine}`
      : `${f.path}:${f.startLine}`;
  }
  return f.path;
};

/**
 * Formats prior findings as concrete suppression context.
 * Unlike themes (abstract patterns), prior findings are specific instances
 * that reviewers must not re-report.
 */
export const formatPriorFindings = (
  findings: readonly ReviewFinding[],
): string => {
  if (findings.length === 0) return "";

  // Cap at 30 findings to keep prompt size reasonable
  const capped = findings.slice(0, 30);

  const items = capped.map((f) => {
    const location = formatFindingLocation(f);
    const persona = f.persona ? ` (${f.persona})` : "";
    return `- \`${location}\` [${f.severity}/${f.category}]${persona}: ${f.description}\n  > Suggestion: ${f.suggestion}`;
  });

  return `\n\n## Previously Reported Findings (IMPORTANT)

The following findings were reported in previous review rounds. They have already been
reviewed and addressed. Do NOT re-report them, variations of them, or similar findings
on the same code locations:

${items.join("\n\n")}`;
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
  conclusions: readonly ThemeConclusion[] = [],
  priorFindings: readonly ReviewFinding[] = [],
): string =>
  `You are a code reviewer for the ${context.projectName} project (${context.primaryLanguage}).

${SINGLE_PASS_PREAMBLE}

## Project Review Criteria

${context.conventions}

${RESPONSE_FORMAT}

${SEVERITY_GUIDELINES}

${CONFIDENCE_GUIDELINES}

${ANTI_PATTERNS}${formatThemesSection(themes, conclusions)}${formatPriorFindings(priorFindings)}`;

export const buildPersonaSystemPrompt = (
  persona: PersonaDefinition,
  context: ReviewContext,
  themes: readonly string[] = [],
  conclusions: readonly ThemeConclusion[] = [],
  priorFindings: readonly ReviewFinding[] = [],
): string =>
  `You are the ${persona.name} for the ${context.projectName} project (${context.primaryLanguage}).

${persona.preamble}${formatFocusSection(persona)}

## Project Review Criteria

${context.conventions}

${RESPONSE_FORMAT}

${SEVERITY_GUIDELINES}

${CONFIDENCE_GUIDELINES}

${ANTI_PATTERNS}${formatThemesSection(themes, conclusions)}${formatPriorFindings(priorFindings)}`;

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
): string => `Extract themes AND specific conclusions from these code review findings.

## Findings

${JSON.stringify(findings, null, 2)}

## Instructions

For each significant finding, extract:
- "theme": short theme phrase (5-10 words)
- "conclusion": the specific decision or observation (1 sentence)
- "antiPattern": what a reviewer should NOT suggest based on this conclusion

Example:
{
  "theme": "redirect prevention in HTTP calls",
  "conclusion": "All fetch calls intentionally use redirect: 'error' to prevent credential leaks",
  "antiPattern": "Do not suggest removing redirect: 'error' or switching to follow mode"
}

Return a JSON object with:
- "themes": array of short theme strings (for backward compatibility)
- "conclusions": array of objects with theme, conclusion, and antiPattern fields

Extract at most 10 themes. Focus on the most significant findings.

Return ONLY the JSON object. No markdown fences, no explanation text, no preamble.`;

/**
 * Builds the verification prompt for the batch verification pass.
 * Includes full file contents and findings to verify.
 */
export const buildVerificationPrompt = (
  fileContents: ReadonlyMap<string, string>,
  findings: readonly {
    readonly index: number;
    readonly severity: string;
    readonly category: string;
    readonly path: string;
    readonly startLine?: number;
    readonly endLine?: number;
    readonly description: string;
    readonly suggestion: string;
  }[],
): string => {
  const fileSections = [...fileContents.entries()]
    .map(([path, content]) => {
      const numbered = content
        .split("\n")
        .map((line, i) => `${String(i + 1).padStart(4)} | ${line}`)
        .join("\n");
      return `### File: ${path}\n\`\`\`\n${numbered}\n\`\`\``;
    })
    .join("\n\n");

  const findingSections = findings
    .map((f) => {
      const location =
        f.startLine !== undefined
          ? f.endLine !== undefined
            ? `${f.path}:${f.startLine}-${f.endLine}`
            : `${f.path}:${f.startLine}`
          : f.path;
      return `- **[${f.index}]** \`${location}\` [${f.severity}/${f.category}]: ${f.description}\n  > Suggestion: ${f.suggestion}`;
    })
    .join("\n\n");

  return `## Source Files

${fileSections}

## Findings to Verify

${findingSections}

## Instructions

For EACH finding above, read the FULL file content provided and determine whether the
finding is a real, actionable issue. Do NOT assume the finding is correct — verify it
by checking the actual code.

Specifically:
- If a finding claims something is missing (import, check, guard), search the file to verify
- If a finding claims a bug, trace the logic to confirm
- If a finding references a line number, check what is actually on that line
- Style issues should almost always be verified=false unless they violate a documented convention

For each finding, return:
- "index": the finding index number
- "verified": true if the finding is a real issue, false if it's a false positive
- "confidence": your confidence (0-100) that your verification is correct
- "evidence": a brief explanation citing specific lines (1-2 sentences)

Return a JSON array of verification results. One entry per finding.

Return ONLY the JSON array. No markdown fences, no explanation text, no preamble.`;
};
