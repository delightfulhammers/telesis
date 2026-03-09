import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import type { ModelClient } from "../model/client.js";
import type { InterviewState } from "../interview/state.js";
import type { DocumentType, GeneratedDocs } from "./types.js";
import { DOCUMENT_ORDER, DOCUMENT_PATHS } from "./types.js";
import { buildGenerationPrompt } from "./prompts.js";

export interface GenerateOptions {
  readonly client: ModelClient;
  readonly state: InterviewState;
  readonly rootDir: string;
  readonly onDocGenerated?: (docType: DocumentType, content: string) => void;
}

export const generateDocuments = async (
  options: GenerateOptions,
): Promise<GeneratedDocs> => {
  const { client, state, rootDir, onDocGenerated } = options;
  const resolvedRoot = resolve(rootDir);
  const docs: Record<string, string> = {};

  for (const docType of DOCUMENT_ORDER) {
    const systemPrompt = buildGenerationPrompt(
      docType,
      state,
      docs as GeneratedDocs,
    );

    const response = await client.complete({
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Generate the ${docType.toUpperCase()} document now.`,
        },
      ],
    });

    docs[docType] = response.content;

    const filePath = join(resolvedRoot, DOCUMENT_PATHS[docType]);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, response.content + "\n");

    onDocGenerated?.(docType, response.content);
  }

  return docs as GeneratedDocs;
};
