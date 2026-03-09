import claudeTmpl from "./claude.md.tmpl" with { type: "text" };
import adrTmpl from "./adr.md.tmpl" with { type: "text" };
import tddTmpl from "./tdd.md.tmpl" with { type: "text" };
import visionTmpl from "./vision.md.tmpl" with { type: "text" };
import prdTmpl from "./prd.md.tmpl" with { type: "text" };
import architectureTmpl from "./architecture.md.tmpl" with { type: "text" };
import milestonesTmpl from "./milestones.md.tmpl" with { type: "text" };

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

interface ContextSection {
  readonly Content: string;
}

type TemplateValue =
  | string
  | number
  | boolean
  | string[]
  | readonly ContextSection[]
  | undefined;

interface TemplateContext {
  [key: string]: TemplateValue;
}

const isTruthy = (val: TemplateValue): boolean =>
  val !== undefined &&
  val !== null &&
  val !== "" &&
  val !== false &&
  val !== 0 &&
  !(Array.isArray(val) && val.length === 0);

/**
 * Token-based Go template renderer.
 * Handles: {{ .Var }}, {{- if .Var }}...{{ else }}...{{ end }},
 * {{ range .Var }}...{{ end }}
 */
const renderTokens = (tmpl: string, context: TemplateContext): string => {
  const TOKEN_RE =
    /(\{\{-?\s*(?:if|else|end|range)\b[^}]*\}\}|\{\{\s*\.[^}]*\}\})/g;
  const parts = tmpl.split(TOKEN_RE);

  interface Frame {
    type: "if" | "range";
    active: boolean;
    inElse: boolean;
    condition: boolean;
    items?: readonly (string | ContextSection)[];
    body?: string;
  }

  const stack: Frame[] = [];
  let output = "";

  const shouldOutput = (): boolean =>
    stack.every((frame) => {
      if (frame.type === "if") {
        return frame.inElse ? !frame.condition : frame.condition;
      }
      return frame.type !== "range";
    });

  const isInRange = (): boolean =>
    stack.some((frame) => frame.type === "range");

  for (const part of parts) {
    const trimmedPart = part.trim();

    const ifMatch = /^\{\{-?\s*if\s+\.(\w+)\s*\}\}$/.exec(trimmedPart);
    const rangeMatch = /^\{\{-?\s*range\s+\.(\w+)\s*\}\}$/.exec(trimmedPart);
    const isElse = /^\{\{-?\s*else\s*-?\}\}$/.test(trimmedPart);
    const isEnd = /^\{\{-?\s*end\s*-?\}\}$/.test(trimmedPart);
    const varMatch = /^\{\{\s*\.(\w+)\s*\}\}$/.exec(trimmedPart);
    const dotMatch = /^\{\{\s*\.\s*\}\}$/.test(trimmedPart);

    if (ifMatch) {
      const varName = ifMatch[1];
      const val = context[varName];
      const condition = isTruthy(val);

      if (isInRange()) {
        const rangeFrame = [...stack].reverse().find((f) => f.type === "range");
        if (rangeFrame) {
          rangeFrame.body = (rangeFrame.body ?? "") + part;
        }
        stack.push({ type: "if", active: true, inElse: false, condition });
        continue;
      }

      if (part.includes("{{-") && output.length > 0) {
        output = output.replace(/\s+$/, "");
      }

      stack.push({ type: "if", active: true, inElse: false, condition });
      continue;
    }

    if (rangeMatch) {
      const varName = rangeMatch[1];
      const items = context[varName];
      stack.push({
        type: "range",
        active: true,
        inElse: false,
        condition: true,
        items: Array.isArray(items)
          ? (items as readonly (string | ContextSection)[])
          : [],
        body: "",
      });
      continue;
    }

    if (isElse) {
      const frame = stack[stack.length - 1];
      if (frame) {
        if (isInRange() && frame.type !== "if") {
          const rangeFrame = [...stack]
            .reverse()
            .find((f) => f.type === "range");
          if (rangeFrame) {
            rangeFrame.body = (rangeFrame.body ?? "") + part;
          }
        } else if (frame.type === "if" && isInRange()) {
          const rangeFrame = [...stack]
            .reverse()
            .find((f) => f.type === "range");
          if (rangeFrame) {
            rangeFrame.body = (rangeFrame.body ?? "") + part;
          }
          frame.inElse = true;
        } else {
          frame.inElse = true;
        }
      }
      continue;
    }

    if (isEnd) {
      const frame = stack[stack.length - 1];
      if (frame) {
        if (frame.type === "if" && isInRange()) {
          const rangeFrame = [...stack]
            .reverse()
            .find((f) => f.type === "range");
          if (rangeFrame) {
            rangeFrame.body = (rangeFrame.body ?? "") + part;
          }
          stack.pop();
          continue;
        }

        if (frame.type === "range") {
          stack.pop();
          const items = frame.items ?? [];
          const body = frame.body ?? "";

          if (items.length === 0) {
            continue;
          }

          const rendered = items
            .map((item) => {
              if (typeof item === "string") {
                return body.replace(/\{\{\s*\.\s*\}\}/g, item);
              }
              if (typeof item === "object" && item !== null) {
                let r = body;
                for (const [key, val] of Object.entries(
                  item as unknown as Record<string, string>,
                )) {
                  r = r.replace(
                    new RegExp(`\\{\\{\\s*\\.${key}\\s*\\}\\}`, "g"),
                    String(val),
                  );
                }
                return r;
              }
              return body.replace(/\{\{\s*\.\s*\}\}/g, String(item));
            })
            .join("");

          if (shouldOutput()) {
            output += rendered;
          }
          continue;
        }

        stack.pop();
      }
      continue;
    }

    // It's either a variable reference or plain text
    if (isInRange()) {
      const rangeFrame = [...stack].reverse().find((f) => f.type === "range");
      if (rangeFrame) {
        rangeFrame.body = (rangeFrame.body ?? "") + part;
      }
      continue;
    }

    if (varMatch && !dotMatch) {
      if (shouldOutput()) {
        const varName = varMatch[1];
        const val = context[varName];
        output += val !== undefined && val !== null ? String(val) : "";
      }
      continue;
    }

    // Plain text
    if (shouldOutput()) {
      output += part;
    }
  }

  return output;
};

export const renderTemplate = (
  templateName: TemplateName,
  context: TemplateContext,
): string => {
  const tmpl = templates[templateName];
  return renderTokens(tmpl, context);
};

export const render = renderTokens;
