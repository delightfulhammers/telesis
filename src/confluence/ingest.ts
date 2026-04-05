/** Ingest Confluence pages into the project docs directory. */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ConfluenceClientConfig, ConfluencePage } from "./types.js";
import { fetchSpacePages } from "./client.js";
import { storageToMarkdown } from "./convert.js";

export interface IngestResult {
  readonly pagesWritten: number;
  readonly skippedExisting: number;
  readonly files: readonly string[];
}

/** Slugify a Confluence page title into a safe filename. */
const slugify = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * Fetch pages from a Confluence space and write them as markdown files.
 * Skips pages that already exist as files (idempotent).
 */
export const ingestConfluenceSpace = async (
  config: ConfluenceClientConfig,
  spaceKey: string,
  outputDir: string,
): Promise<IngestResult> => {
  const pages = await fetchSpacePages(config, spaceKey);
  mkdirSync(outputDir, { recursive: true });

  const files: string[] = [];
  let skippedExisting = 0;

  for (const page of pages) {
    const slug = slugify(page.title);
    const filename = `${slug}.md`;
    const filepath = join(outputDir, filename);

    if (existsSync(filepath)) {
      skippedExisting++;
      continue;
    }

    const markdown = storageToMarkdown(page.body.storage.value);
    const content =
      `---\ntitle: "${page.title}"\nsource: confluence\npage_id: "${page.id}"\n---\n\n` +
      markdown +
      "\n";

    writeFileSync(filepath, content);
    files.push(filename);
  }

  return {
    pagesWritten: files.length,
    skippedExisting,
    files,
  };
};
