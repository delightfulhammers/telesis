import { describe, it, expect } from "vitest";
import { bold, dim, red, green, cyan, stripAnsi, fitWidth } from "./colors.js";

describe("color functions", () => {
  it("wraps text with ANSI codes", () => {
    expect(bold("hello")).toContain("\x1b[1m");
    expect(bold("hello")).toContain("\x1b[0m");
    expect(red("error")).toContain("\x1b[31m");
    expect(green("ok")).toContain("\x1b[32m");
    expect(cyan("info")).toContain("\x1b[36m");
    expect(dim("faint")).toContain("\x1b[2m");
  });
});

describe("stripAnsi", () => {
  it("removes ANSI escape codes", () => {
    expect(stripAnsi(bold("hello"))).toBe("hello");
    expect(stripAnsi(red("error"))).toBe("error");
  });

  it("handles nested codes", () => {
    expect(stripAnsi(bold(red("nested")))).toBe("nested");
  });

  it("passes through plain text", () => {
    expect(stripAnsi("plain")).toBe("plain");
  });
});

describe("fitWidth", () => {
  it("pads short strings with spaces", () => {
    const result = fitWidth("hi", 10);
    expect(stripAnsi(result)).toBe("hi        ");
  });

  it("truncates long strings with ellipsis", () => {
    const result = fitWidth("hello world this is long", 10);
    const visible = stripAnsi(result);
    expect(visible.length).toBe(10);
    expect(visible).toContain("…");
  });

  it("handles exact width", () => {
    const result = fitWidth("exact", 5);
    expect(stripAnsi(result)).toBe("exact");
  });

  it("handles colored strings", () => {
    const result = fitWidth(red("short"), 10);
    expect(stripAnsi(result)).toHaveLength(10);
    expect(result).toContain("\x1b[31m"); // color preserved
  });
});
