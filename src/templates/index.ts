import Mustache from "mustache";
import claudeTmpl from "./claude.md.tmpl" with { type: "text" };
import adrTmpl from "./adr.md.tmpl" with { type: "text" };
import tddTmpl from "./tdd.md.tmpl" with { type: "text" };
import visionTmpl from "./vision.md.tmpl" with { type: "text" };
import prdTmpl from "./prd.md.tmpl" with { type: "text" };
import architectureTmpl from "./architecture.md.tmpl" with { type: "text" };
import milestonesTmpl from "./milestones.md.tmpl" with { type: "text" };

// Global side effect: disable HTML escaping for all Mustache.render() calls
// in this process. This is safe because Telesis only generates markdown, never
// HTML. Mustache's API does not support per-render escape configuration.
Mustache.escape = (text: string): string => text;

export const templates = {
  "claude.md.tmpl": claudeTmpl,
  "adr.md.tmpl": adrTmpl,
  "tdd.md.tmpl": tddTmpl,
  "vision.md.tmpl": visionTmpl,
  "prd.md.tmpl": prdTmpl,
  "architecture.md.tmpl": architectureTmpl,
  "milestones.md.tmpl": milestonesTmpl,
} as const;

export type TemplateName = keyof typeof templates;

export const renderTemplate = (
  templateName: TemplateName,
  context: Record<string, unknown>,
): string => {
  const tmpl = templates[templateName];
  return Mustache.render(tmpl, context);
};
