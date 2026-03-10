import { Command } from "commander";
import { appendNote, loadNotes } from "../notes/store.js";
import { formatNoteList } from "../notes/format.js";
import { projectRoot } from "./project-root.js";
import { handleAction } from "./handle-action.js";

const MAX_STDIN_BYTES = 1024 * 1024; // 1 MB

const readStdin = (): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let overflowed = false;
    process.stdin.on("data", (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buf.length;
      if (totalBytes > MAX_STDIN_BYTES) {
        overflowed = true;
        reject(new Error("stdin input exceeds 1 MB limit"));
        process.stdin.destroy();
        return;
      }
      chunks.push(buf);
    });
    process.stdin.on("end", () => {
      if (!overflowed) {
        resolve(Buffer.concat(chunks).toString("utf-8").trim());
      }
    });
    process.stdin.on("error", (err) => {
      if (!overflowed) {
        reject(err);
      }
    });
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
      try {
        const note = appendNote(rootDir, noteText, opts.tag);
        const tagLabel =
          note.tags.length > 0 ? ` (tags: ${note.tags.join(", ")})` : "";
        console.log(`Note added${tagLabel}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`note write failed: ${message}`);
        process.exitCode = 1;
      }
    }),
  );

const listCommand = new Command("list")
  .description("List development notes")
  .option("-t, --tag <tag>", "Filter by tag")
  .option("--json", "Output as JSON")
  .action(
    handleAction((opts: { tag?: string; json?: boolean }) => {
      const rootDir = projectRoot();
      const { items, invalidLineCount } = loadNotes(rootDir);
      let notes = items;

      if (invalidLineCount > 0) {
        console.error(
          `Warning: ${invalidLineCount} malformed line(s) in notes.jsonl were skipped.`,
        );
      }

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
