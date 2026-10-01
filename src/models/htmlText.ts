// Convert a card's `descriptionHtml` into plain text for searching.
//
// DOM-free on purpose. The production app has a DOM, but keeping this a pure
// string function means it can be unit-tested in `node` without jsdom, and it
// stays usable from any module without a renderer.
//
// Why it exists: descriptions are Tiptap HTML. Matching the raw markup would
// make a card match on `<p>`, `href`, or a style attribute — noise that has
// nothing to do with what the user typed. Strip tags FIRST, then compare.

/** Tags whose entire contents are discarded, not just the tags themselves. */
const DROPPED_CONTENT_TAGS = ["script", "style", "noscript", "template"];

/**
 * Named entities produced by the editor's own sanitization, plus the ones that
 * appear in ordinary prose. Numeric entities (`&#39;`, `&#x27;`) are handled
 * separately since they are unbounded.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  copy: "©",
  reg: "®",
  trade: "™",
};

/**
 * Reduce an HTML fragment to searchable plain text.
 *
 * - `<script>` / `<style>` / `<noscript>` / `<template>` contents are removed
 *   entirely (they are never visible text, and `<script>` bodies would
 *   otherwise leak into results).
 * - All remaining tags are removed; block-level tags become a space so words
 *   either side of a `</p><p>` do not fuse into one token.
 * - Named and numeric entities are decoded.
 * - Whitespace is collapsed and trimmed.
 *
 * Returns `""` for empty/nullish input — callers can treat falsy as "no text"
 * without a separate guard.
 */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";

  let out = html;

  // Remove the contents of tags whose text is not user-visible. Done before
  // the generic tag strip, otherwise `<script>` bodies would survive.
  for (const tag of DROPPED_CONTENT_TAGS) {
    out = out.replace(
      new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi"),
      " ",
    );
    // An unclosed `<script>` at the tail would otherwise leak its body.
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*$`, "gi"), " ");
  }

  // Block-level boundaries become a space so "one" + "two" don't become
  // "onetwo" when the markup between them is dropped.
  out = out.replace(
    /<\/?(?:p|div|br|li|ul|ol|h[1-6]|blockquote|pre|tr|td|th|section|article)\b[^>]*>/gi,
    " ",
  );

  // Any remaining tags (inline markup, closing tags, unknown tags).
  out = out.replace(/<[^>]*>/g, " ");

  out = decodeEntities(out);

  // Collapse all whitespace (including newlines/tabs) to single spaces.
  return out.replace(/\s+/g, " ").trim();
}

/** Decode named and numeric HTML entities to their literal characters. */
function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (!body.startsWith("#")) {
      // An unknown named entity is left verbatim. It is not our text to
      // rewrite, and dropping it would silently join the words around it.
      return NAMED_ENTITIES[body.toLowerCase()] ?? match;
    }
    const isHex = body[1] === "x" || body[1] === "X";
    const code = Number.parseInt(
      isHex ? body.slice(2) : body.slice(1),
      isHex ? 16 : 10,
    );
    // The pattern guarantees at least one digit, so the parse cannot fail and
    // the value is never negative — the only possible rejection is a code
    // point beyond the Unicode range, which we leave verbatim.
    if (code > 0x10ffff) return match;
    return String.fromCodePoint(code);
  });
}