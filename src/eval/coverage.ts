import type { InterviewState } from "../agent/interview/state.js";
import type { GeneratedDocs } from "../agent/generate/types.js";
import type { AxisScore, Diagnostic } from "./types.js";

/**
 * Common words that don't represent meaningful project topics.
 * These are filtered out during topic extraction to avoid false positives.
 */
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "shall",
  "can",
  "need",
  "must",
  "ought",
  "i",
  "me",
  "my",
  "we",
  "our",
  "you",
  "your",
  "it",
  "its",
  "they",
  "them",
  "their",
  "he",
  "she",
  "his",
  "her",
  "this",
  "that",
  "these",
  "those",
  "what",
  "which",
  "who",
  "whom",
  "when",
  "where",
  "why",
  "how",
  "and",
  "but",
  "or",
  "nor",
  "not",
  "no",
  "so",
  "if",
  "then",
  "than",
  "too",
  "very",
  "just",
  "also",
  "of",
  "in",
  "on",
  "at",
  "to",
  "for",
  "with",
  "by",
  "from",
  "up",
  "about",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "between",
  "out",
  "off",
  "over",
  "under",
  "again",
  "further",
  "once",
  "here",
  "there",
  "all",
  "each",
  "every",
  "both",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "only",
  "own",
  "same",
  "any",
  "as",
  "like",
  "want",
  "think",
  "know",
  "get",
  "make",
  "go",
  "see",
  "use",
  "said",
  "say",
  "tell",
  "well",
  "yes",
  "no",
  "yeah",
  "sure",
  "ok",
  "okay",
  "right",
  "good",
  "great",
  "really",
  "thing",
  "things",
  "something",
  "anything",
  "building",
  "built",
  "build",
  "going",
  "using",
  "used",
  "basically",
  "probably",
  "actually",
  "maybe",
  "kind",
  "sort",
  "lot",
  "much",
  "many",
  "way",
  "still",
  "even",
  "now",
  "already",
  "first",
  "one",
  "two",
  "new",
  "im",
  "ive",
  "dont",
  "doesnt",
  "its",
  "thats",
  "lets",
  "id",
  "needs",
  "able",
  "take",
  "keep",
  "come",
  "work",
  "works",
  "working",
  "help",
  "helps",
  "start",
  "look",
  "looks",
  "want",
  "wants",
  "support",
  "supports",
  "called",
  "call",
  "plan",
  "plans",
]);

/**
 * Extracts meaningful topic phrases from user messages in the interview.
 *
 * Strategy: extract both single significant words and adjacent word pairs
 * (bigrams) from user messages, filtering out stop words and short tokens.
 */
export const extractTopics = (state: InterviewState): readonly string[] => {
  const userMessages = state.turns
    .filter((t) => t.role === "user")
    .map((t) => t.content);

  if (userMessages.length === 0) return [];

  const topics = new Set<string>();

  for (const message of userMessages) {
    const words = message
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

    // Single meaningful words (4+ chars to be significant)
    for (const word of words) {
      if (word.length >= 4) {
        topics.add(word);
      }
    }

    // Bigrams (adjacent word pairs) — capture compound concepts
    for (let i = 0; i < words.length - 1; i++) {
      topics.add(`${words[i]} ${words[i + 1]}`);
    }
  }

  return [...topics];
};

/**
 * Tokenizes text into a Set of lowercase words for O(1) lookup.
 */
const tokenize = (text: string): Set<string> => {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
  return new Set(words);
};

/**
 * Evaluates how well the generated documents cover topics from the interview.
 *
 * Produces a single aggregate score across all documents — coverage is a
 * cross-document concern (a topic might appear in architecture but not vision,
 * and that's fine).
 */
export const evaluateCoverage = (
  state: InterviewState,
  docs: Required<GeneratedDocs>,
): AxisScore => {
  const topics = extractTopics(state);

  if (topics.length === 0) {
    return {
      axis: "coverage",
      document: "global",
      score: 1.0,
      diagnostics: [],
    };
  }

  const combinedText = [
    docs.vision,
    docs.prd,
    docs.architecture,
    docs.milestones,
  ].join("\n\n");

  // Tokenize once for O(1) single-word lookups
  const wordSet = tokenize(combinedText);
  // Lowercase combined text for bigram substring matching
  const combinedLower = combinedText.toLowerCase();

  const diagnostics: Diagnostic[] = [];
  let covered = 0;

  for (const topic of topics) {
    const found = topic.includes(" ")
      ? combinedLower.includes(topic) // Bigrams: exact phrase substring match
      : wordSet.has(topic); // Single words: Set lookup

    if (found) {
      covered++;
    } else {
      diagnostics.push({
        axis: "coverage",
        document: "global",
        message: `Interview topic not found in generated docs: "${topic}"`,
        severity: "warning",
      });
    }
  }

  const score = covered / topics.length;
  return { axis: "coverage", document: "global", score, diagnostics };
};
