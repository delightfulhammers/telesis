import { create as docCreate, nextNumber as docNextNumber } from "../docgen/docgen.js";
import type { DocConfig } from "../docgen/docgen.js";

const ADR_CONFIG: DocConfig = {
  prefix: "ADR",
  subdir: "adr",
  template: "adr.md.tmpl",
};

export const create = (rootDir: string, slug: string): string =>
  docCreate(rootDir, ADR_CONFIG, slug);

export const nextNumber = (adrDir: string): number =>
  docNextNumber(adrDir, "ADR");
