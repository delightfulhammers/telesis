import type { ModelClient } from "../agent/model/client.js";

interface WorkItemSummary {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

interface MilestoneGrouping {
  readonly name: string;
  readonly goal: string;
  readonly workItemIds: readonly string[];
}

export interface TriageResult {
  readonly milestones: readonly MilestoneGrouping[];
  readonly tokenUsage: { inputTokens: number; outputTokens: number };
}

export interface TddAssessmentInput {
  readonly milestoneName: string;
  readonly milestoneGoal: string;
  readonly workItemTitles: readonly string[];
}

export interface TddAssessmentResult {
  readonly needsTdd: boolean;
  readonly rationale: string;
  readonly tokenUsage: { inputTokens: number; outputTokens: number };
}

const TRIAGE_SYSTEM_PROMPT = `You are a development project triager. Given a list of work items, suggest how to group them into milestones. Each milestone should be a cohesive unit of work that can be planned, executed, and shipped together.

Respond with JSON only:
{
  "milestones": [
    {
      "name": "Short milestone name",
      "goal": "One-sentence goal",
      "workItemIds": ["id1", "id2"]
    }
  ]
}

Group related items together. A single work item can be its own milestone if it's large enough. Prefer fewer, larger milestones over many small ones.`;

const TDD_SYSTEM_PROMPT = `You are a software architect. Given a milestone description, determine whether it introduces a new package or subsystem with its own interface boundary that warrants a Technical Design Document (TDD).

A TDD is needed when:
- A new package/directory is being created with its own public API
- Significant design decisions need to be documented (containment patterns, retry strategies, protocol choices)
- The milestone introduces architectural patterns that future code will build on

A TDD is NOT needed when:
- The milestone is a configuration change, bug fix, or wiring of existing pieces
- No new interface boundaries are created
- The work is purely within existing packages

Respond with JSON only:
{
  "needsTdd": true/false,
  "rationale": "One-sentence explanation"
}`;

/**
 * Asks the LLM to suggest how to group work items into milestones.
 * Used at TRIAGE state for the orchestrator to propose scope to the human.
 */
export const suggestTriageGrouping = async (
  client: ModelClient,
  workItems: readonly WorkItemSummary[],
): Promise<TriageResult> => {
  // All fields are UNTRUSTED external content (from GitHub issues via intake)
  const MAX_ITEMS = 50;
  const MAX_TITLE_LENGTH = 100;
  const MAX_BODY_LENGTH = 500;
  const itemList = workItems
    .slice(0, MAX_ITEMS)
    .map((wi) => {
      const title = wi.title.slice(0, MAX_TITLE_LENGTH);
      const body =
        wi.body.length > MAX_BODY_LENGTH
          ? wi.body.slice(0, MAX_BODY_LENGTH) + "..."
          : wi.body;
      const id = wi.id.slice(0, 50);
      return `- [${id}] ${title}: ${body}`;
    })
    .join("\n");

  const response = await client.complete({
    system: TRIAGE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Here are the pending work items:\n\n${itemList}\n\nSuggest milestone groupings.`,
      },
    ],
    maxTokens: 1024,
  });

  try {
    const parsed = JSON.parse(response.content);
    if (parsed.milestones !== undefined && !Array.isArray(parsed.milestones)) {
      console.error(
        "Warning: LLM returned unexpected milestones shape, treating as empty",
      );
    }
    const validMilestones = Array.isArray(parsed.milestones)
      ? parsed.milestones.filter((m: unknown) => {
          if (!m || typeof m !== "object") return false;
          const obj = m as Record<string, unknown>;
          return (
            typeof obj.name === "string" &&
            typeof obj.goal === "string" &&
            Array.isArray(obj.workItemIds) &&
            obj.workItemIds.every((id: unknown) => typeof id === "string")
          );
        })
      : [];
    return {
      milestones: validMilestones,
      tokenUsage: response.usage,
    };
  } catch {
    return {
      milestones: [],
      tokenUsage: response.usage,
    };
  }
};

/**
 * Asks the LLM whether a milestone warrants a TDD.
 * Used at MILESTONE_SETUP state. Defaults to true on parse failure (safe side).
 */
export const assessTddNecessity = async (
  client: ModelClient,
  input: TddAssessmentInput,
): Promise<TddAssessmentResult> => {
  // Fields may be sourced from UNTRUSTED intake — cap lengths
  const name = input.milestoneName.slice(0, 100);
  const goal = input.milestoneGoal.slice(0, 200);
  const titles = input.workItemTitles
    .slice(0, 20)
    .map((t) => t.slice(0, 100))
    .join(", ");

  const response = await client.complete({
    system: TDD_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          `Milestone: ${name}`,
          `Goal: ${goal}`,
          `Work items: ${titles}`,
          "",
          "Does this milestone need a TDD?",
        ].join("\n"),
      },
    ],
    maxTokens: 256,
  });

  try {
    const parsed = JSON.parse(response.content);
    return {
      needsTdd: parsed.needsTdd === true,
      rationale: parsed.rationale ?? "",
      tokenUsage: response.usage,
    };
  } catch {
    return {
      needsTdd: true,
      rationale:
        "Could not parse LLM response; defaulting to TDD required (safe side)",
      tokenUsage: response.usage,
    };
  }
};
