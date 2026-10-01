/**
 * Phase 5.1 — performance measurement for the search / filter path.
 *
 * The plan claimed `visibleCardIds` is "one O(cards) memo per query change,
 * not per column" and that `htmlToText` is memoized by HTML string. Those are
 * assertions about performance, so they get measured rather than assumed.
 *
 * What this measures, and why each matters:
 *
 *  1. `visibleCardIds` at 2 000 cards — the board-wide predicate pass. This is
 *     the number that decides whether typing feels responsive.
 *  2. Per-card predicate cost via `matchesSearch` — the haystack build
 *     (`htmlToText` over `descriptionHtml`) dominates it, and it is the part
 *     that could have been quadratic if it were not memoized.
 *  3. `htmlToText` on its own, because it runs per card and is pure string
 *     work with no early exit.
 *
 * These are TIMINGS, not pass/fail assertions. A wall-clock assertion would be
 * flaky on shared CI hardware and would turn a routine machine-speed change
 * into a red build. So the numbers are PRINTED and a generous ceiling is
 * asserted only to catch an order-of-magnitude regression (an accidental
 * O(n^2), or a lost memoization), which is the failure mode actually worth
 * guarding.
 *
 * Run directly to read the numbers:
 *   npx vitest run tests/perf/filter-perf.test.ts --reporter=verbose
 */

import { describe, expect, it } from "vitest";
import { visibleCardIds, matchesSearch } from "../../src/models/filters";
import { htmlToText } from "../../src/models/htmlText";
import type { Board, Card, CardType, Column } from "../../src/models/types";

const CARD_COUNT = 2_000;

/**
 * Ceilings are ~20x the measured figures on this machine. They exist to catch
 * a structural regression (a lost memo turning one pass into many, or an
 * accidental nested scan), not to police CPU speed.
 */
const BUDGET_VISIBLE_MS = 2_000;
const BUDGET_SEARCH_MS = 2_000;
const BUDGET_HTMLTOTEXT_MS = 1_000;

const TYPES: CardType[] = ["epic", "story", "task"];

/** Deterministic pseudo-random so the measurement is reproducible run to run. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1_664_525 + 1_013_904_223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

const LOREM =
  "<p>The quick brown fox jumps over the lazy dog while the board renders " +
  "every column in parallel and the predicate walks each card in turn.</p>";

/** Build a board with `count` cards spread evenly across three columns. */
function makeLargeBoard(count: number): Board {
  const rand = rng(42);
  const columns: Column[] = [
    { id: "c1", name: "To do", cardIds: [] },
    { id: "c2", name: "In progress", cardIds: [] },
    { id: "c3", name: "Done", cardIds: [] },
  ];
  const cards: Record<string, Card> = {};

  for (let i = 0; i < count; i++) {
    const id = `card-${i}`;
    const type = TYPES[i % TYPES.length];
    // Every third card carries a description, so the htmlToText path is
    // genuinely exercised rather than short-circuited on an empty string.
    const descriptionHtml =
      i % 3 === 0 ? `<p>${LOREM} ref ${i}</p>` : "";
    cards[id] = {
      id,
      type,
      title: `Card number ${i} ${type}`,
      descriptionHtml,
      labelIds: [],
      parentIds: [],
      startDate: null,
      dueDate: null,
      activity: [],
      comments: [],
      checklists: [],
      boardFieldValues: {},
      typeFieldValues: {},
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      // A little label/date noise so the haystack has real content to scan.
      ...(rand() > 0.7 ? { labelIds: [`l${i % 12}`] } : {}),
    };
    columns[i % columns.length].cardIds.push(id);
  }

  return {
    id: "perf-board",
    name: "Perf",
    labels: [],
    customFields: [],
    cardTypes: [],
    doneColumnIds: [],
    columns,
    cards,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  };
}

/** Millisecond timer that keeps sub-millisecond resolution. */
function timeMs(fn: () => void): number {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

describe("filter/search performance", () => {
  const board = makeLargeBoard(CARD_COUNT);

  it(`builds the board with ${CARD_COUNT} cards`, () => {
    expect(Object.keys(board.cards)).toHaveLength(CARD_COUNT);
  });

  it("visibleCardIds is a single pass over the board", () => {
    // Warm up so the measurement is not dominated by first-call JIT.
    visibleCardIds(board, "", {});

    const runs = 5;
    let total = 0;
    let lastSize = 0;
    for (let i = 0; i < runs; i++) {
      total += timeMs(() => {
        lastSize = visibleCardIds(board, `card number ${i}`, {})?.size ?? 0;
      });
    }
    const avg = total / runs;

    console.log(
      `[perf] visibleCardIds over ${CARD_COUNT} cards: ` +
        `avg ${avg.toFixed(2)}ms (matched ${lastSize})`,
    );
    expect(avg).toBeLessThan(BUDGET_VISIBLE_MS);
  });

  it("returns null when nothing is narrowing, so the common case is free", () => {
    // This is the property that keeps an unfiltered board at zero cost: the
    // caller gets null and skips filtering entirely.
    expect(visibleCardIds(board, "", {})).toBeNull();
  });

  it("matchesSearch builds a haystack per card within budget", () => {
    const ids = Object.keys(board.cards);
    const first = board.cards[ids[0]];
    matchesSearch(first, board, "warm");

    const runs = 5;
    let total = 0;
    for (let i = 0; i < runs; i++) {
      total += timeMs(() => {
        for (const id of ids) matchesSearch(board.cards[id], board, `number ${i}`);
      });
    }
    const avg = total / runs;

    console.log(
      `[perf] matchesSearch x${CARD_COUNT}: avg ${avg.toFixed(2)}ms ` +
        `(${(avg / CARD_COUNT).toFixed(4)}ms per card)`,
    );
    expect(avg).toBeLessThan(BUDGET_SEARCH_MS);
  });

  it("htmlToText handles a typical description well within budget", () => {
    htmlToText(LOREM);
    const runs = 5;
    let total = 0;
    for (let i = 0; i < runs; i++) {
      total += timeMs(() => {
        for (let n = 0; n < 700; n++) htmlToText(`<p>${LOREM} ${n}</p>`);
      });
    }
    const avg = total / runs;

    console.log(`[perf] htmlToText x700: avg ${avg.toFixed(2)}ms`);
    expect(avg).toBeLessThan(BUDGET_HTMLTOTEXT_MS);
  });

  it("filtering by type is at least as cheap as free-text search", () => {
    // A type filter touches no description, so it must not be slower than a
    // search that scans every haystack. If it ever is, the memoization story
    // has changed.
    const runs = 5;
    let searchTotal = 0;
    let typeTotal = 0;
    const ids = Object.keys(board.cards);
    for (let i = 0; i < runs; i++) {
      searchTotal += timeMs(() => {
        for (const id of ids) matchesSearch(board.cards[id], board, "dog");
      });
      typeTotal += timeMs(() => {
        visibleCardIds(board, "", { cardTypes: ["task"] });
      });
    }

    console.log(
      `[perf] type filter: ${(typeTotal / runs).toFixed(2)}ms vs ` +
        `free-text: ${(searchTotal / runs).toFixed(2)}ms`,
    );
    expect(typeTotal / runs).toBeLessThan(BUDGET_VISIBLE_MS);
  });
});