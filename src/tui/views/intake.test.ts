import { describe, it, expect, vi } from "vitest";
import { createIntakeView } from "./intake.js";
import type { WorkItem } from "../../intake/types.js";

const makeItem = (id: string, title: string, status = "pending"): WorkItem =>
  ({
    id,
    source: "github",
    sourceId: "1",
    sourceUrl: "https://github.com/test/1",
    title,
    body: "",
    labels: [],
    status,
    importedAt: new Date().toISOString(),
  }) as WorkItem;

const key = (name: string) => ({
  name,
  ctrl: false,
  shift: false,
  raw: Buffer.alloc(0),
});

describe("createIntakeView", () => {
  it("creates a view named Intake", () => {
    const view = createIntakeView({ loadItems: () => [] });
    expect(view.name).toBe("Intake");
  });

  it("calls onSkip when s is pressed on pending item", () => {
    const onSkip = vi.fn();
    const items = [makeItem("abc", "Fix bug")];
    const view = createIntakeView({ loadItems: () => items, onSkip });

    view.onKey(key("s"));
    expect(onSkip).toHaveBeenCalledWith(items[0]);
  });

  it("does not call onSkip on non-pending item", () => {
    const onSkip = vi.fn();
    const items = [makeItem("abc", "Fix bug", "completed")];
    const view = createIntakeView({ loadItems: () => items, onSkip });

    view.onKey(key("s"));
    expect(onSkip).not.toHaveBeenCalled();
  });

  it("calls onApprove when a is pressed", () => {
    const onApprove = vi.fn();
    const items = [makeItem("abc", "Fix bug")];
    const view = createIntakeView({ loadItems: () => items, onApprove });

    view.onKey(key("a"));
    expect(onApprove).toHaveBeenCalledWith(items[0]);
  });

  it("refreshes on r key", () => {
    let callCount = 0;
    const view = createIntakeView({
      loadItems: () => {
        callCount++;
        return [];
      },
    });

    view.onKey(key("r"));
    expect(callCount).toBe(2); // initial + refresh
  });

  it("navigates with arrow keys", () => {
    const items = [makeItem("a", "First"), makeItem("b", "Second")];
    const view = createIntakeView({ loadItems: () => items });

    expect(view.onKey(key("down"))).toBe(true);
  });

  it("renders without throwing", () => {
    const items = [makeItem("abc", "Fix bug"), makeItem("def", "Add feature")];
    const view = createIntakeView({ loadItems: () => items });

    const lines: string[] = [];
    const mockScreen = {
      rows: 24,
      cols: 80,
      writeLine: (_row: number, text: string) => lines.push(text),
    };
    view.render(mockScreen as never, 0, 20);
    expect(lines.length).toBeGreaterThan(0);
  });
});
