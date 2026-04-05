import { describe, it, expect } from "vitest";
import { parseKey } from "./keys.js";

describe("parseKey", () => {
  it("parses Ctrl+C", () => {
    const key = parseKey(Buffer.from([0x03]));
    expect(key.name).toBe("c");
    expect(key.ctrl).toBe(true);
  });

  it("parses Ctrl+L", () => {
    const key = parseKey(Buffer.from([0x0c]));
    expect(key.name).toBe("l");
    expect(key.ctrl).toBe(true);
  });

  it("parses Enter", () => {
    const key = parseKey(Buffer.from([0x0d]));
    expect(key.name).toBe("enter");
  });

  it("parses Tab", () => {
    const key = parseKey(Buffer.from([0x09]));
    expect(key.name).toBe("tab");
  });

  it("parses Escape", () => {
    const key = parseKey(Buffer.from([0x1b]));
    expect(key.name).toBe("escape");
  });

  it("parses Backspace", () => {
    const key = parseKey(Buffer.from([0x7f]));
    expect(key.name).toBe("backspace");
  });

  it("parses arrow up", () => {
    const key = parseKey(Buffer.from([0x1b, 0x5b, 0x41]));
    expect(key.name).toBe("up");
  });

  it("parses arrow down", () => {
    const key = parseKey(Buffer.from([0x1b, 0x5b, 0x42]));
    expect(key.name).toBe("down");
  });

  it("parses arrow right", () => {
    const key = parseKey(Buffer.from([0x1b, 0x5b, 0x43]));
    expect(key.name).toBe("right");
  });

  it("parses arrow left", () => {
    const key = parseKey(Buffer.from([0x1b, 0x5b, 0x44]));
    expect(key.name).toBe("left");
  });

  it("parses Home", () => {
    const key = parseKey(Buffer.from([0x1b, 0x5b, 0x48]));
    expect(key.name).toBe("home");
  });

  it("parses End", () => {
    const key = parseKey(Buffer.from([0x1b, 0x5b, 0x46]));
    expect(key.name).toBe("end");
  });

  it("parses Page Up", () => {
    const key = parseKey(Buffer.from([0x1b, 0x5b, 0x35, 0x7e]));
    expect(key.name).toBe("pageup");
  });

  it("parses Page Down", () => {
    const key = parseKey(Buffer.from([0x1b, 0x5b, 0x36, 0x7e]));
    expect(key.name).toBe("pagedown");
  });

  it("parses printable character", () => {
    const key = parseKey(Buffer.from([0x61])); // 'a'
    expect(key.name).toBe("a");
    expect(key.ctrl).toBe(false);
    expect(key.shift).toBe(false);
  });

  it("detects shift for uppercase", () => {
    const key = parseKey(Buffer.from([0x41])); // 'A'
    expect(key.name).toBe("A");
    expect(key.shift).toBe(true);
  });

  it("parses number keys", () => {
    const key = parseKey(Buffer.from([0x31])); // '1'
    expect(key.name).toBe("1");
  });

  it("returns unknown for unrecognized sequences", () => {
    const key = parseKey(Buffer.from([0x1b, 0x5b, 0xff]));
    expect(key.name).toBe("unknown");
  });
});
