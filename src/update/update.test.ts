import { describe, it, expect } from "vitest";

describe("update", () => {
  it("exports checkForUpdate and performUpdate", async () => {
    const mod = await import("./update.js");
    expect(typeof mod.checkForUpdate).toBe("function");
    expect(typeof mod.performUpdate).toBe("function");
    expect(typeof mod.checkLatestVersion).toBe("function");
  });
});
