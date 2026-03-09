import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface ProjectContext {
  readonly name: string;
  readonly owner: string;
  readonly purpose: string;
  readonly primaryLanguage: readonly string[];
  readonly constraints: readonly string[];
  readonly successCriteria: string;
  readonly architectureHints: string;
  readonly outOfScope: readonly string[];
  readonly additionalContext: Readonly<Record<string, string>>;
}

export interface Turn {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export interface InterviewState {
  readonly sessionId: string;
  readonly turns: readonly Turn[];
  readonly complete: boolean;
  readonly turnCount: number;
}

const STATE_PATH = ".telesis/interview-state.json";

export const createInitialState = (sessionId: string): InterviewState => ({
  sessionId,
  turns: [],
  complete: false,
  turnCount: 0,
});

export const addTurn = (state: InterviewState, turn: Turn): InterviewState => ({
  ...state,
  turns: [...state.turns, turn],
  turnCount: turn.role === "user" ? state.turnCount + 1 : state.turnCount,
});

export const markComplete = (state: InterviewState): InterviewState => ({
  ...state,
  complete: true,
});

export const saveState = async (
  rootDir: string,
  state: InterviewState,
): Promise<void> => {
  const resolvedRoot = resolve(rootDir);
  const dir = join(resolvedRoot, ".telesis");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(resolvedRoot, STATE_PATH),
    JSON.stringify(state, null, 2) + "\n",
  );
};

export const loadState = async (
  rootDir: string,
): Promise<InterviewState | null> => {
  const resolvedRoot = resolve(rootDir);
  let data: string;
  try {
    data = await readFile(join(resolvedRoot, STATE_PATH), "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  return JSON.parse(data) as InterviewState;
};
