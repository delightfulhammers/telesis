import { describe, it, expect } from "vitest";
import { extractMarkdownSection } from "./markdown.js";

describe("extractMarkdownSection", () => {
  it("extracts content under a matched heading", () => {
    const content = `# Title

## Section A

Content of section A.

## Section B

Content of section B.
`;
    const result = extractMarkdownSection(content, /^##\s+section\s+a/im);
    expect(result).toBe("Content of section A.");
  });

  it("returns null when heading is not found", () => {
    const content = "# Title\n\nSome content.";
    expect(extractMarkdownSection(content, /^##\s+missing/im)).toBeNull();
  });

  it("includes sub-headings in extracted section", () => {
    const content = `# Title

## Requirements

### Task Management

- Create tasks
- Delete tasks

### Notifications

- Push notifications

## Success Criteria

1. Works well
`;
    const result = extractMarkdownSection(content, /^##\s+requirements/im);
    expect(result).toContain("### Task Management");
    expect(result).toContain("### Notifications");
    expect(result).not.toContain("Success Criteria");
  });

  it("stops at equal-level heading", () => {
    const content = `## First

Content one.

## Second

Content two.
`;
    const result = extractMarkdownSection(content, /^##\s+first/im);
    expect(result).toBe("Content one.");
  });

  it("stops at higher-level heading", () => {
    const content = `## Details

### Sub A

Detail A.

# Next Top Level

Top content.
`;
    const result = extractMarkdownSection(content, /^##\s+details/im);
    expect(result).toContain("### Sub A");
    expect(result).toContain("Detail A.");
    expect(result).not.toContain("Next Top Level");
  });

  it("returns content to end of document when no closing heading", () => {
    const content = `## Only Section

All the content here.
More content.
`;
    const result = extractMarkdownSection(content, /^##\s+only\s+section/im);
    expect(result).toBe("All the content here.\nMore content.");
  });

  it("returns null for heading with empty body", () => {
    const content = `## Empty

## Next
`;
    const result = extractMarkdownSection(content, /^##\s+empty/im);
    expect(result).toBeNull();
  });

  it("handles ### level headings correctly", () => {
    const content = `### Acceptance Criteria

1. First criterion
2. Second criterion

### Build Sequence

1. Phase 1
`;
    const result = extractMarkdownSection(
      content,
      /^###?\s+acceptance\s+criteria/im,
    );
    expect(result).toContain("First criterion");
    expect(result).toContain("Second criterion");
    expect(result).not.toContain("Build Sequence");
  });
});
