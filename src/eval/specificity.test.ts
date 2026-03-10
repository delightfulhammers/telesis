import { describe, it, expect } from "vitest";
import { evaluateSpecificity } from "./specificity.js";
import type { DocumentType } from "../agent/generate/types.js";

const score = (doc: DocumentType, content: string) =>
  evaluateSpecificity(doc, content);

describe("specificity evaluator", () => {
  it("scores high for project-specific content", () => {
    const specific = `# Vision

## The Problem

Managing household tasks across family members is chaotic. Shared calendars
don't capture recurring chores, delegation, or completion tracking. Families
resort to whiteboards and text messages, leading to dropped tasks and arguments.

## The Vision

ChoreTracker is a mobile-first family chore management app that makes household
task delegation transparent and accountable.

## Principles

1. **Family-friendly UX** — Every screen must be usable by a 10-year-old.
2. **Offline-first** — The app works without internet; syncs when connected.
3. **Fair rotation** — Chore assignment algorithms prevent the same person
   from always getting the worst jobs.
4. **No guilt, no shame** — Progress is shown positively, never punitively.
`;

    const result = score("vision", specific);
    expect(result.score).toBeGreaterThan(0.7);
  });

  it("scores low for generic boilerplate content", () => {
    const generic = `# Vision

## The Problem

Users face challenges in their daily workflows. Current solutions are
inadequate and don't meet their needs.

## The Vision

This project provides a modern, scalable solution that addresses user needs
and delivers value.

## Principles

1. **User-centric design** — Always put the user first.
2. **Scalability** — Build for growth from day one.
3. **Maintainability** — Write clean, well-documented code.
4. **Security** — Follow industry best practices for security.
`;

    const result = score("vision", generic);
    expect(result.score).toBeLessThan(0.5);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("detects generic principles specifically", () => {
    const genericPrinciples = `# Vision

## Principles

1. **User-centric** — Put the user first in everything.
2. **Scalable** — Design for scale.
3. **Secure** — Security by design.
4. **Maintainable** — Clean code and good documentation.
`;

    const result = score("vision", genericPrinciples);
    expect(
      result.diagnostics.some((d) =>
        d.message.toLowerCase().includes("generic"),
      ),
    ).toBe(true);
  });

  it("handles empty content", () => {
    const result = score("vision", "");
    expect(result.score).toBe(0);
  });

  it("handles content with mixed specific and generic sections", () => {
    const mixed = `# Architecture

## System Overview

ChoreTracker uses a React Native frontend with a PostgreSQL backend.

## Components

The system has components that handle various responsibilities in a
scalable and maintainable way. It delivers value through a
comprehensive solution that addresses user needs and follows
industry best practices.
`;

    const result = score("architecture", mixed);
    // Should be middling — some specific, some generic
    expect(result.score).toBeGreaterThan(0.2);
    expect(result.score).toBeLessThan(0.9);
  });
});
