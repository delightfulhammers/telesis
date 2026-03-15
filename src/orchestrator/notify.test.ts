import { describe, it, expect } from "vitest";
import { notify } from "./notify.js";

describe("notify", () => {
  it("does not throw on notification failure", () => {
    // notify is best-effort — it should never throw even if osascript fails
    expect(() => notify("Test", "This is a test notification")).not.toThrow();
  });
});
