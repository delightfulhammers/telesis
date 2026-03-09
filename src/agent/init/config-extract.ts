import type { ModelClient } from "../model/client.js";
import type { InterviewState } from "../interview/state.js";
import type { Config } from "../../config/config.js";

const EXTRACTION_PROMPT = `You are extracting structured project metadata from a developer interview transcript.

## Task

From the conversation below, extract these fields:

- **name**: The project name (required). If the developer did not state an explicit name, infer a short, lowercase, hyphenated name from what the project does (e.g., "tic-tac-toe", "expense-tracker").
- **owner**: The organization or individual who owns the project
- **language**: The primary programming language(s)
- **repo**: The repository URL (if mentioned)

## Output format

Return ONLY a JSON object with these fields. No explanation, no markdown formatting.

Example:
{"name": "myproject", "owner": "Acme Corp", "language": "TypeScript", "repo": "github.com/acme/myproject"}

If a field (other than name) was not mentioned in the conversation, use an empty string. The name field must always have a value.`;

const formatConversation = (state: InterviewState): string =>
  state.turns
    .map(
      (t) => `${t.role === "user" ? "Developer" : "Interviewer"}: ${t.content}`,
    )
    .join("\n\n");

const extractJsonFromResponse = (content: string): string => {
  const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  return codeBlockMatch ? codeBlockMatch[1].trim() : content.trim();
};

const coerceToString = (val: unknown): string => {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val;
  return String(val);
};

export const extractConfig = async (
  client: ModelClient,
  state: InterviewState,
): Promise<Config> => {
  const systemPrompt = `${EXTRACTION_PROMPT}\n\n## Interview transcript\n\n${formatConversation(state)}`;

  const response = await client.complete({
    system: systemPrompt,
    messages: [{ role: "user", content: "Extract the project metadata now." }],
  });

  const jsonStr = extractJsonFromResponse(response.content);

  let raw: unknown;
  try {
    raw = JSON.parse(jsonStr);
  } catch {
    throw new Error("Failed to parse config extraction response");
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Failed to parse config extraction response");
  }

  const parsed = raw as Record<string, unknown>;

  const name = typeof parsed.name === "string" ? parsed.name.trim() : "";

  if (!name) {
    throw new Error("Config extraction missing required field: name");
  }

  return {
    project: {
      name,
      owner: coerceToString(parsed.owner),
      language: coerceToString(parsed.language),
      status: "active",
      repo: coerceToString(parsed.repo),
    },
  };
};
