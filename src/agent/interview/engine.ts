import type { ModelClient } from "../model/client.js";
import type { Message } from "../model/types.js";
import {
  type InterviewState,
  createInitialState,
  addTurn,
  markComplete,
  saveState,
} from "./state.js";
import { buildInterviewSystemPrompt, hasCompletionSignal } from "./prompts.js";

const DEFAULT_MAX_TURNS = 20;
const DONE_SENTINEL = "/done";

export interface InterviewIO {
  readonly readInput: () => Promise<string>;
  readonly writeOutput: (text: string) => void;
}

export interface InterviewOptions {
  readonly client: ModelClient;
  readonly io: InterviewIO;
  readonly rootDir: string;
  readonly sessionId: string;
  readonly maxTurns?: number;
}

export const runInterview = async (
  options: InterviewOptions,
): Promise<InterviewState> => {
  const {
    client,
    io,
    rootDir,
    sessionId,
    maxTurns = DEFAULT_MAX_TURNS,
  } = options;

  const systemPrompt = buildInterviewSystemPrompt();
  let state = createInitialState(sessionId);

  io.writeOutput(
    "\nI'll ask you a few questions about your project, then generate your\n" +
      "project documents. Type /done at any time to proceed with what we have.\n\n" +
      "─────────────────────────────────────────────────────────────────\n",
  );

  for (;;) {
    // Check max turns before prompting the model for another question
    if (state.turnCount >= maxTurns) {
      io.writeOutput(
        `\nReached maximum of ${maxTurns} turns. Proceeding with collected context.\n`,
      );
      state = markComplete(state);
      await saveState(rootDir, state);
      break;
    }

    // Build messages from conversation history
    const messages: Message[] = state.turns.map((t) => ({
      role: t.role,
      content: t.content,
    }));

    // Get assistant response via streaming
    let assistantText = "";
    for await (const event of client.completeStream({
      system: systemPrompt,
      messages,
    })) {
      if (event.type === "text") {
        io.writeOutput(event.text);
        assistantText += event.text;
      }
    }

    io.writeOutput(
      "\n\n─────────────────────────────────────────────────────────────────\n",
    );

    state = addTurn(state, { role: "assistant", content: assistantText });

    // Persist after assistant turn so it survives interruption during user input
    await saveState(rootDir, state);

    // Check if model signaled completion
    if (hasCompletionSignal(assistantText)) {
      state = markComplete(state);
      await saveState(rootDir, state);
      break;
    }

    // Read user input
    const input = await io.readInput();
    io.writeOutput(
      "\n─────────────────────────────────────────────────────────────────\n\n",
    );

    // Check for /done sentinel
    if (input.trim().toLowerCase() === DONE_SENTINEL) {
      io.writeOutput("Proceeding to document generation.\n");
      state = markComplete(state);
      state = addTurn(state, { role: "user", content: input });
      await saveState(rootDir, state);
      break;
    }

    state = addTurn(state, { role: "user", content: input });
    await saveState(rootDir, state);
  }

  return state;
};
