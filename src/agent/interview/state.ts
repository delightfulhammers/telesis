import { mkdir, writeFile, readFile, rename } from "node:fs/promises";
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

const isValidTurn = (val: unknown): val is Turn => {
  if (!val || typeof val !== "object") return false;
  const obj = val as Record<string, unknown>;
  return (
    (obj.role === "user" || obj.role === "assistant") &&
    typeof obj.content === "string"
  );
};

const validateState = (raw: unknown, filePath: string): InterviewState => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Invalid interview state at ${filePath}: not an object`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.sessionId !== "string") {
    throw new Error(
      `Invalid interview state at ${filePath}: missing sessionId`,
    );
  }
  if (typeof obj.complete !== "boolean") {
    throw new Error(
      `Invalid interview state at ${filePath}: missing or invalid complete`,
    );
  }
  if (typeof obj.turnCount !== "number") {
    throw new Error(
      `Invalid interview state at ${filePath}: missing or invalid turnCount`,
    );
  }
  if (!Array.isArray(obj.turns) || !obj.turns.every(isValidTurn)) {
    throw new Error(
      `Invalid interview state at ${filePath}: invalid turns array`,
    );
  }
  return raw as InterviewState;
};

export const saveState = async (
  rootDir: string,
  state: InterviewState,
): Promise<void> => {
  const resolvedRoot = resolve(rootDir);
  const dir = join(resolvedRoot, ".telesis");
  await mkdir(dir, { recursive: true });
  const finalPath = join(resolvedRoot, STATE_PATH);
  const tmpPath = finalPath + ".tmp";
  await writeFile(tmpPath, JSON.stringify(state, null, 2) + "\n");
  await rename(tmpPath, finalPath);
};

export const loadState = async (
  rootDir: string,
): Promise<InterviewState | null> => {
  const resolvedRoot = resolve(rootDir);
  const filePath = join(resolvedRoot, STATE_PATH);
  let data: string;
  try {
    data = await readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch (err) {
    throw new Error(
      `Failed to parse interview state at ${filePath}: ${(err as Error).message}`,
    );
  }
  return validateState(raw, filePath);
};
