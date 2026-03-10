import type { ModelClient } from "../model/client.js";
import type { InterviewState } from "../interview/state.js";

/**
 * Structured topics extracted from the interview transcript.
 * Each category maps to interview content relevant for document generation.
 */
export interface InterviewTopics {
  /** Core features and functionality discussed */
  readonly features: readonly string[];
  /** Technical preferences and constraints (e.g., "functional programming", "offline-first") */
  readonly preferences: readonly string[];
  /** Technology choices mentioned (languages, frameworks, databases, etc.) */
  readonly technologies: readonly string[];
  /** Items explicitly marked as out of scope */
  readonly outOfScope: readonly string[];
  /** Success criteria or definition of done */
  readonly successCriteria: readonly string[];
  /** Architectural decisions or hints */
  readonly architectureHints: readonly string[];
}

const EXTRACTION_PROMPT = `You are extracting structured topics from a developer interview transcript.

## Task
Analyze the interview conversation and extract all discussed topics into categories.
Be thorough — every feature, preference, constraint, and decision mentioned by the developer
must appear in the output. Do not omit anything the developer said, even if it seems minor.

## Output format
Return ONLY a JSON object with these fields (all arrays of short strings):

- features: Core features and functionality the developer wants to build
- preferences: Development preferences and constraints (e.g., "functional programming style", "offline-first", "single binary")
- technologies: Specific technologies mentioned (languages, frameworks, databases, tools)
- outOfScope: Items the developer explicitly said are NOT part of this project
- successCriteria: What "done" looks like, success metrics
- architectureHints: Architectural decisions, patterns, or structural choices

Each item should be a concise phrase (3-10 words). Include everything the developer mentioned,
not just what seems most important.`;

const formatConversation = (state: InterviewState): string =>
  state.turns
    .map(
      (t) => `${t.role === "user" ? "Developer" : "Interviewer"}: ${t.content}`,
    )
    .join("\n\n");

/**
 * Extracts structured topics from the interview transcript using a model call.
 * Returns a categorized summary of everything discussed in the interview.
 */
export const extractTopics = async (
  client: ModelClient,
  state: InterviewState,
): Promise<InterviewTopics> => {
  if (state.turns.length === 0) {
    return {
      features: [],
      preferences: [],
      technologies: [],
      outOfScope: [],
      successCriteria: [],
      architectureHints: [],
    };
  }

  const response = await client.complete({
    system: `${EXTRACTION_PROMPT}\n\n## Interview transcript\n\n${formatConversation(state)}`,
    messages: [
      { role: "user", content: "Extract all topics from this interview now." },
    ],
  });

  return parseTopicsResponse(response.content);
};

/**
 * Parses the model's JSON response into InterviewTopics.
 * Falls back to empty arrays for missing fields.
 */
export const parseTopicsResponse = (content: string): InterviewTopics => {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      features: [],
      preferences: [],
      technologies: [],
      outOfScope: [],
      successCriteria: [],
      architectureHints: [],
    };
  }

  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

  const toStringArray = (value: unknown): readonly string[] =>
    Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];

  return {
    features: toStringArray(parsed.features),
    preferences: toStringArray(parsed.preferences),
    technologies: toStringArray(parsed.technologies),
    outOfScope: toStringArray(parsed.outOfScope),
    successCriteria: toStringArray(parsed.successCriteria),
    architectureHints: toStringArray(parsed.architectureHints),
  };
};

/**
 * Formats extracted topics as a markdown section for inclusion in generation prompts.
 */
export const formatTopicsSummary = (topics: InterviewTopics): string => {
  const sections: string[] = [];

  const addSection = (label: string, items: readonly string[]) => {
    if (items.length > 0) {
      sections.push(`**${label}:**\n${items.map((i) => `- ${i}`).join("\n")}`);
    }
  };

  addSection("Features discussed", topics.features);
  addSection("Developer preferences", topics.preferences);
  addSection("Technologies mentioned", topics.technologies);
  addSection("Out of scope", topics.outOfScope);
  addSection("Success criteria", topics.successCriteria);
  addSection("Architecture hints", topics.architectureHints);

  if (sections.length === 0) return "";

  return `## Topics from interview (ensure ALL appear in output)\n\n${sections.join("\n\n")}`;
};
