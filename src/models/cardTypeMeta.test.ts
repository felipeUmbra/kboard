import { describe, it, expect } from "vitest";
import { CARD_TYPE_META, getMeta, displayLabel } from "./cardTypeMeta";

describe("getMeta", () => {
  it("returns metadata for each card type", () => {
    expect(getMeta("epic")).toBe(CARD_TYPE_META.epic);
    expect(getMeta("story")).toBe(CARD_TYPE_META.story);
    expect(getMeta("task")).toBe(CARD_TYPE_META.task);
  });

  it("epic has no parent, can have children (story)", () => {
    const epic = getMeta("epic");
    expect(epic.canHaveParent).toBe(false);
    expect(epic.parentType).toBeNull();
    expect(epic.canHaveChildren).toBe(true);
    expect(epic.childType).toBe("story");
  });

  it("story can have parent (epic) and child (task)", () => {
    const story = getMeta("story");
    expect(story.canHaveParent).toBe(true);
    expect(story.parentType).toBe("epic");
    expect(story.canHaveChildren).toBe(true);
    expect(story.childType).toBe("task");
  });

  it("task can have parent (story), no children", () => {
    const task = getMeta("task");
    expect(task.canHaveParent).toBe(true);
    expect(task.parentType).toBe("story");
    expect(task.canHaveChildren).toBe(false);
    expect(task.childType).toBeNull();
  });
});

describe("displayLabel", () => {
  it("returns default label when no custom label", () => {
    expect(displayLabel("epic")).toBe("Epic");
    expect(displayLabel("story")).toBe("Story");
    expect(displayLabel("task")).toBe("Task");
  });

  it("returns custom label when provided", () => {
    expect(displayLabel("epic", "Feature")).toBe("Feature");
    expect(displayLabel("task", "Work Item")).toBe("Work Item");
  });

  it("falls back to default when custom label is whitespace", () => {
    expect(displayLabel("epic", "   ")).toBe("Epic");
    expect(displayLabel("epic", "")).toBe("Epic");
  });
});
