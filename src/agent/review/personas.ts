import type { PersonaDefinition } from "./types.js";

export const securityPersona: PersonaDefinition = {
  slug: "security",
  name: "Security Reviewer",
  preamble: `You are a senior security engineer specializing in application security.
Focus on OWASP Top 10 vulnerabilities, authentication/authorization flaws,
injection attacks, sensitive data exposure, and unsafe input handling.

Apply threat modeling based on trust boundaries:
- UNTRUSTED: user input, external API responses, file uploads, CLI arguments
- TRUSTED: configured LLM responses, application's own data stores, internal config

Focus findings on actual attack surfaces where untrusted data enters the application.
Do not raise findings for trusted internal data paths.`,
  focusCategories: ["security", "bug"],
  ignoreCategories: ["style", "maintainability"],
};

export const architecturePersona: PersonaDefinition = {
  slug: "architecture",
  name: "Architecture Reviewer",
  preamble: `You are a software architect focused on code structure, design quality, and
convention adherence. Evaluate import discipline, package boundaries, SOLID principles,
appropriate abstractions, and documented architectural decisions.

Pay close attention to the project's own conventions and architecture rules provided
in the review criteria. Flag violations of documented patterns — these are not style
preferences, they are design decisions with rationale.`,
  focusCategories: ["architecture", "maintainability"],
  ignoreCategories: ["performance"],
};

export const correctnessPersona: PersonaDefinition = {
  slug: "correctness",
  name: "Correctness Reviewer",
  preamble: `You are a senior engineer focused on program correctness and robustness.
Identify bugs, logic errors, off-by-one errors, null/undefined risks, error handling
gaps, resource leaks, and edge cases. Also flag obvious performance issues like
unnecessary allocations or poor algorithmic complexity.

Prioritize issues that will cause incorrect behavior in production over theoretical
concerns. Every finding should describe a concrete scenario where the code fails.`,
  focusCategories: ["bug", "performance"],
  ignoreCategories: ["style", "architecture"],
};

export const BUILT_IN_PERSONAS: readonly PersonaDefinition[] = [
  securityPersona,
  architecturePersona,
  correctnessPersona,
];

export interface PersonaModelOverride {
  readonly slug: string;
  readonly model?: string;
}

/**
 * Applies config-level model overrides to built-in persona definitions.
 * Returns a new list with overrides applied (matched by slug).
 */
export const applyPersonaOverrides = (
  personas: readonly PersonaDefinition[],
  overrides: readonly PersonaModelOverride[],
): readonly PersonaDefinition[] => {
  const overrideMap = new Map(overrides.map((o) => [o.slug, o]));

  return personas.map((p) => {
    const override = overrideMap.get(p.slug);
    if (!override) return p;
    return {
      ...p,
      model: override.model ?? p.model,
    };
  });
};

export const findPersona = (
  slug: string,
  personas: readonly PersonaDefinition[] = BUILT_IN_PERSONAS,
): PersonaDefinition | undefined => personas.find((p) => p.slug === slug);

export const resolvePersonaSlugs = (
  slugs: readonly string[],
  personas: readonly PersonaDefinition[] = BUILT_IN_PERSONAS,
): readonly PersonaDefinition[] => {
  const resolved: PersonaDefinition[] = [];
  const unknown: string[] = [];

  for (const slug of slugs) {
    const found = findPersona(slug, personas);
    if (found) {
      resolved.push(found);
    } else {
      unknown.push(slug);
    }
  }

  if (unknown.length > 0) {
    const available = personas.map((p) => p.slug).join(", ");
    throw new Error(
      `Unknown persona(s): ${unknown.join(", ")}. Available: ${available}`,
    );
  }

  return resolved;
};
