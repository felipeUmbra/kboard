import { describe, it, expect } from "vitest";
import type { Card } from "../models/types";
import { cardDrafts, draftDiffersFromCard, type CardDraft } from "./cardDrafts";

describe("draftDiffersFromCard", () => {
  const card: Pick<Card, "title" | "descriptionHtml"> = {
    title: "Hello",
    descriptionHtml: "<p>World</p>",
  };

  it("returns false when draft is null", () => {
    expect(draftDiffersFromCard(null, card)).toBe(false);
  });

  it("returns false when draft matches card exactly", () => {
    const draft: CardDraft = {
      title: "Hello",
      descriptionHtml: "<p>World</p>",
      updatedAt: Date.now(),
    };
    expect(draftDiffersFromCard(draft, card)).toBe(false);
  });

  it("returns true when title differs", () => {
    const draft: CardDraft = {
      title: "Changed",
      descriptionHtml: "<p>World</p>",
      updatedAt: Date.now(),
    };
    expect(draftDiffersFromCard(draft, card)).toBe(true);
  });

  it("returns true when description differs", () => {
    const draft: CardDraft = {
      title: "Hello",
      descriptionHtml: "<p>Changed</p>",
      updatedAt: Date.now(),
    };
    expect(draftDiffersFromCard(draft, card)).toBe(true);
  });
});
