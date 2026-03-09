import {
  readdirSync,
  writeFileSync,
  openSync,
  closeSync,
  unlinkSync,
  constants,
} from "node:fs";
import { join } from "node:path";
import { renderTemplate } from "../templates/index.js";
import type { TemplateName } from "../templates/index.js";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface DocConfig {
  readonly prefix: string; // e.g., "ADR" or "TDD"
  readonly subdir: string; // e.g., "adr" or "tdd"
  readonly template: TemplateName; // e.g., "adr.md.tmpl"
}

export const validateSlug = (slug: string): void => {
  if (!slug) {
    throw new Error("slug is required");
  }
  if (!SLUG_RE.test(slug)) {
    throw new Error(
      "slug must be lowercase alphanumeric with hyphens (e.g., 'use-nats-for-events')",
    );
  }
};

export const nextNumber = (docDir: string, prefix: string): number => {
  const numberRe = new RegExp(`^${escapeRegExp(prefix)}-(\\d+)`);

  let entries: string[];
  try {
    entries = readdirSync(docDir);
  } catch {
    throw new Error(`reading directory: ${docDir}`);
  }

  let highest = 0;
  for (const name of entries) {
    const m = numberRe.exec(name);
    if (m?.[1]) {
      const n = parseInt(m[1], 10);
      if (n > highest) highest = n;
    }
  }

  return highest + 1;
};

const escapeRegExp = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const renderDoc = (
  templateName: TemplateName,
  num: number,
  slug: string,
): string =>
  renderTemplate(templateName, {
    Number: num,
    Slug: slug,
    Padded: String(num).padStart(3, "0"),
  });

const writeExclusive = (dest: string, content: string): void => {
  // O_EXCL ensures the file doesn't already exist
  let fd: number;
  try {
    fd = openSync(dest, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o666);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "EEXIST") {
      throw Object.assign(new Error(`file already exists: ${dest}`), {
        code: "EEXIST",
      });
    }
    throw err;
  }

  try {
    writeFileSync(fd, content);
  } catch (writeErr) {
    closeSync(fd);
    try {
      unlinkSync(dest);
    } catch {
      // cleanup best-effort
    }
    throw writeErr;
  }

  closeSync(fd);
};

export const create = (
  rootDir: string,
  cfg: DocConfig,
  slug: string,
): string => {
  validateSlug(slug);

  const docDir = join(rootDir, "docs", cfg.subdir);
  const MAX_RETRIES = 5;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const num = nextNumber(docDir, cfg.prefix);
    const content = renderDoc(cfg.template, num, slug);
    const filename = `${cfg.prefix}-${String(num).padStart(3, "0")}-${slug}.md`;
    const dest = join(docDir, filename);

    try {
      writeExclusive(dest, content);
      return dest;
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "EEXIST") {
        // Concurrent collision — retry
        continue;
      }
      throw new Error(`writing ${filename}: ${(err as Error).message}`);
    }
  }

  throw new Error(
    `could not create ${cfg.prefix} after ${MAX_RETRIES} attempts (concurrent collision)`,
  );
};
