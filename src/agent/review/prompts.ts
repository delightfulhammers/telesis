import type { ReviewContext } from "./types.js";

export const buildSystemPrompt = (
  context: ReviewContext,
): string => `You are a code reviewer for the ${context.projectName} project (${context.primaryLanguage}).

Your job is to review a code diff against the project's own conventions, architecture rules, and design decisions. Focus on:

1. **Correctness** — bugs, logic errors, off-by-one errors, null/undefined risks
2. **Security** — injection, unsafe input handling, secrets exposure
3. **Architecture** — violations of documented rules, import discipline, package boundaries
4. **Maintainability** — complexity, unclear naming, missing error handling
5. **Performance** — obvious inefficiencies (not micro-optimizations)
6. **Style** — violations of documented conventions

## Project Review Criteria

${context.conventions}

## Response Format

Return a JSON array of findings. Each finding must have these fields:

- "severity": one of "critical", "high", "medium", "low"
- "category": one of "bug", "security", "architecture", "maintainability", "performance", "style"
- "path": the file path from the diff
- "startLine": the line number where the issue starts (from the diff's +line numbers), or null if not applicable
- "endLine": the line number where the issue ends, or null
- "description": a concise description of the problem (1-2 sentences)
- "suggestion": a concrete suggestion for how to fix it (not just "fix this")

If there are no findings, return an empty array: []

Return ONLY the JSON array. No markdown fences, no explanation text, no preamble.

## Severity Guidelines

- **critical**: Will cause data loss, security breach, or crash in production
- **high**: Bug that will cause incorrect behavior, or significant architecture violation
- **medium**: Maintainability concern, minor convention violation, potential edge case
- **low**: Style nit, minor improvement suggestion`;

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
