import { describe, it, expect } from "vitest";
import { createSelectableList } from "./list.js";
import type { KeyEvent } from "./keys.js";

const key = (name: string): KeyEvent => ({
  name,
  ctrl: false,
  shift: false,
  raw: Buffer.alloc(0),
});

describe("createSelectableList", () => {
  it("starts with cursor at 0", () => {
    const list = createSelectableList(["a", "b", "c"]);
    expect(list.cursor()).toBe(0);
    expect(list.selected()).toBe("a");
  });

  it("moves cursor down", () => {
    const list = createSelectableList(["a", "b", "c"]);
    list.onKey(key("down"));
    expect(list.cursor()).toBe(1);
    expect(list.selected()).toBe("b");
  });

  it("moves cursor up", () => {
    const list = createSelectableList(["a", "b", "c"]);
    list.onKey(key("down"));
    list.onKey(key("up"));
    expect(list.cursor()).toBe(0);
  });

  it("clamps at top", () => {
    const list = createSelectableList(["a", "b"]);
    list.onKey(key("up"));
    expect(list.cursor()).toBe(0);
  });

  it("clamps at bottom", () => {
    const list = createSelectableList(["a", "b"]);
    list.onKey(key("down"));
    list.onKey(key("down"));
    list.onKey(key("down"));
    expect(list.cursor()).toBe(1);
  });

  it("home jumps to start", () => {
    const list = createSelectableList(["a", "b", "c"]);
    list.onKey(key("down"));
    list.onKey(key("down"));
    list.onKey(key("home"));
    expect(list.cursor()).toBe(0);
  });

  it("end jumps to last", () => {
    const list = createSelectableList(["a", "b", "c"]);
    list.onKey(key("end"));
    expect(list.cursor()).toBe(2);
  });

  it("returns false for unhandled keys", () => {
    const list = createSelectableList(["a"]);
    expect(list.onKey(key("x"))).toBe(false);
  });

  it("returns true for handled keys", () => {
    const list = createSelectableList(["a", "b"]);
    expect(list.onKey(key("down"))).toBe(true);
  });

  it("handles empty list", () => {
    const list = createSelectableList([]);
    expect(list.selected()).toBeUndefined();
    expect(list.onKey(key("down"))).toBe(false);
  });

  it("setItems updates the list", () => {
    const list = createSelectableList(["a"]);
    list.setItems(["x", "y", "z"]);
    expect(list.items()).toEqual(["x", "y", "z"]);
    expect(list.selected()).toBe("x");
  });

  it("clamps cursor when items shrink", () => {
    const list = createSelectableList(["a", "b", "c"]);
    list.onKey(key("end")); // cursor at 2
    list.setItems(["a"]); // now only 1 item
    expect(list.cursor()).toBe(0);
  });

  it("computes visible range", () => {
    const list = createSelectableList(["a", "b", "c", "d", "e"]);
    const range = list.visibleRange(3);
    expect(range).toEqual({ start: 0, end: 3 });
  });

  it("scrolls to keep cursor visible", () => {
    const list = createSelectableList(["a", "b", "c", "d", "e"]);
    list.onKey(key("end")); // cursor at 4
    const range = list.visibleRange(3);
    expect(range.start).toBe(2);
    expect(range.end).toBe(5);
  });
});
