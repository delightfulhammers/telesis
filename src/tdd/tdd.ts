import { create as docCreate, nextNumber as docNextNumber } from "../docgen/docgen.js";
import type { DocConfig } from "../docgen/docgen.js";

const TDD_CONFIG: DocConfig = {
  prefix: "TDD",
  subdir: "tdd",
  template: "tdd.md.tmpl",
};

export const create = (rootDir: string, slug: string): string =>
  docCreate(rootDir, TDD_CONFIG, slug);

export const nextNumber = (tddDir: string): number =>
  docNextNumber(tddDir, "TDD");
