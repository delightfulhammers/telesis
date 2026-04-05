import { describe, it, expect } from "vitest";
import { storageToMarkdown } from "./convert.js";

describe("storageToMarkdown", () => {
  it("converts headings", () => {
    expect(storageToMarkdown("<h1>Title</h1>")).toBe("# Title");
    expect(storageToMarkdown("<h2>Section</h2>")).toBe("## Section");
    expect(storageToMarkdown("<h3>Sub</h3>")).toBe("### Sub");
  });

  it("converts bold and italic", () => {
    expect(storageToMarkdown("<strong>bold</strong>")).toBe("**bold**");
    expect(storageToMarkdown("<em>italic</em>")).toBe("*italic*");
    expect(storageToMarkdown("<b>bold</b>")).toBe("**bold**");
  });

  it("converts inline code", () => {
    expect(storageToMarkdown("<code>foo()</code>")).toBe("`foo()`");
  });

  it("converts links", () => {
    expect(storageToMarkdown('<a href="https://example.com">link</a>')).toBe(
      "[link](https://example.com)",
    );
  });

  it("converts unordered lists", () => {
    const html = "<ul><li>one</li><li>two</li></ul>";
    const md = storageToMarkdown(html);
    expect(md).toContain("- one");
    expect(md).toContain("- two");
  });

  it("converts paragraphs", () => {
    const html = "<p>First paragraph</p><p>Second paragraph</p>";
    const md = storageToMarkdown(html);
    expect(md).toContain("First paragraph");
    expect(md).toContain("Second paragraph");
  });

  it("converts line breaks", () => {
    expect(storageToMarkdown("line1<br/>line2")).toBe("line1\nline2");
  });

  it("converts pre blocks to code fences", () => {
    const html = "<pre>const x = 1;</pre>";
    const md = storageToMarkdown(html);
    expect(md).toContain("```");
    expect(md).toContain("const x = 1;");
  });

  it("decodes HTML entities", () => {
    expect(storageToMarkdown("&amp; &lt; &gt; &quot;")).toBe('& < > "');
  });

  it("strips Confluence macros", () => {
    const html =
      '<ac:structured-macro ac:name="info"><ac:rich-text-body><p>Note</p></ac:rich-text-body></ac:structured-macro>';
    const md = storageToMarkdown(html);
    expect(md).not.toContain("ac:");
  });

  it("strips remaining HTML tags", () => {
    const html = '<div class="panel"><span>content</span></div>';
    expect(storageToMarkdown(html)).toBe("content");
  });

  it("cleans up excessive whitespace", () => {
    const html = "<p>one</p>\n\n\n\n<p>two</p>";
    const md = storageToMarkdown(html);
    expect(md).not.toMatch(/\n{3,}/);
  });

  it("handles empty input", () => {
    expect(storageToMarkdown("")).toBe("");
  });

  it("converts a realistic Confluence page", () => {
    const html = `
      <h1>Architecture</h1>
      <p>This document describes the <strong>system architecture</strong>.</p>
      <h2>Components</h2>
      <ul>
        <li>API Gateway</li>
        <li>Auth Service</li>
        <li>Database Layer</li>
      </ul>
      <p>See <a href="https://wiki.company.com/design">design docs</a> for details.</p>
    `;
    const md = storageToMarkdown(html);
    expect(md).toContain("# Architecture");
    expect(md).toContain("## Components");
    expect(md).toContain("**system architecture**");
    expect(md).toContain("- API Gateway");
    expect(md).toContain("[design docs](https://wiki.company.com/design)");
  });
});
