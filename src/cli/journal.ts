import { Command } from "commander";
import { appendEntry, loadEntries } from "../journal/store.js";
import { formatEntryList, formatEntryDetail } from "../journal/format.js";
import { projectRoot } from "./project-root.js";
import { handleAction } from "./handle-action.js";

const addCommand = new Command("add")
  .description("Add a journal entry")
  .argument("<title>", "Entry title")
  .argument("<body>", "Entry body text")
  .action(
    handleAction((title: string, body: string) => {
      const rootDir = projectRoot();
      const entry = appendEntry(rootDir, title, body);
      console.log(`Journal entry added: ${entry.date} — ${entry.title}`);
    }),
  );

const listCommand = new Command("list")
  .description("List journal entries")
  .option("--json", "Output as JSON")
  .action(
    handleAction((opts: { json?: boolean }) => {
      const rootDir = projectRoot();
      const { items, invalidLineCount } = loadEntries(rootDir);

      if (invalidLineCount > 0) {
        console.error(
          `Warning: ${invalidLineCount} malformed line(s) in journal.jsonl were skipped.`,
        );
      }

      if (opts.json) {
        console.log(JSON.stringify(items, null, 2));
        return;
      }

      const output = formatEntryList(items);
      if (output) {
        console.log(output);
      } else {
        console.log("No journal entries.");
      }
    }),
  );

const showCommand = new Command("show")
  .description("Show a journal entry")
  .argument("<query>", "Entry ID, date (YYYY-MM-DD), or title substring")
  .action(
    handleAction((query: string) => {
      const rootDir = projectRoot();
      const { items } = loadEntries(rootDir);

      const match = findEntry(items, query);
      if (!match) {
        console.error(`No journal entry matching "${query}"`);
        process.exitCode = 1;
        return;
      }

      console.log(formatEntryDetail(match));
    }),
  );

import type { JournalEntry } from "../journal/types.js";

const findEntry = (
  entries: readonly JournalEntry[],
  query: string,
): JournalEntry | undefined => {
  const q = query.toLowerCase();

  // Exact ID match
  const byId = entries.find((e) => e.id === query);
  if (byId) return byId;

  // Date match (returns most recent entry on that date)
  const byDate = entries.filter((e) => e.date === query);
  if (byDate.length > 0) return byDate[byDate.length - 1];

  // Title substring match (returns first match)
  return entries.find((e) => e.title.toLowerCase().includes(q));
};

export const journalCommand = new Command("journal")
  .description("Manage the design journal")
  .addCommand(addCommand)
  .addCommand(listCommand)
  .addCommand(showCommand);
