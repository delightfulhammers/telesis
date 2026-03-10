import { Command } from "commander";
import { appendNote, loadNotes } from "../notes/store.js";
import { formatNoteList } from "../notes/format.js";
import { projectRoot } from "./project-root.js";
import { handleAction } from "./handle-action.js";

const readStdin = (): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on("end", () =>
      resolve(Buffer.concat(chunks).toString("utf-8").trim()),
    );
    process.stdin.on("error", reject);
  });

const addCommand = new Command("add")
  .description("Add a development note")
  .argument("<text>", 'Note text (use "-" to read from stdin)')
  .option(
    "-t, --tag <tag>",
    "Tag for the note (repeatable)",
    (val: string, acc: string[]) => [...acc, val],
    [] as string[],
  )
  .action(
    handleAction(async (text: string, opts: { tag: string[] }) => {
      const rootDir = projectRoot();
      const noteText = text === "-" ? await readStdin() : text;
      const note = appendNote(rootDir, noteText, opts.tag);
      const tagLabel =
        note.tags.length > 0 ? ` (tags: ${note.tags.join(", ")})` : "";
      console.log(`Note added${tagLabel}`);
    }),
  );

const listCommand = new Command("list")
  .description("List development notes")
  .option("-t, --tag <tag>", "Filter by tag")
  .option("--json", "Output as JSON")
  .action(
    handleAction((opts: { tag?: string; json?: boolean }) => {
      const rootDir = projectRoot();
      let notes = loadNotes(rootDir);

      if (opts.tag) {
        notes = notes.filter((n) => n.tags.includes(opts.tag!));
      }

      if (opts.json) {
        console.log(JSON.stringify(notes, null, 2));
        return;
      }

      const output = formatNoteList(notes);
      if (output) {
        console.log(output);
      }
    }),
  );

export const noteCommand = new Command("note")
  .description("Manage development notes")
  .addCommand(addCommand)
  .addCommand(listCommand);
