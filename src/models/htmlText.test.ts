import { describe, it, expect } from "vitest";
import { htmlToText } from "./htmlText";

describe("htmlToText", () => {
  it("returns empty string for empty, null and undefined input", () => {
    expect(htmlToText("")).toBe("");
    expect(htmlToText(null)).toBe("");
    expect(htmlToText(undefined)).toBe("");
  });

  it("passes plain text through unchanged", () => {
    expect(htmlToText("Fix login redirect")).toBe("Fix login redirect");
  });

  it("strips tags but keeps the text", () => {
    expect(htmlToText("<p>Fix login redirect</p>")).toBe("Fix login redirect");
  });

  it("handles nested tags", () => {
    expect(
      htmlToText("<p>Fix <strong>login</strong> <em>redirect</em></p>"),
    ).toBe("Fix login redirect");
  });

  it("separates words across block boundaries", () => {
    // Without a space from the block tags, these would fuse into "onetwo".
    expect(htmlToText("<p>one</p><p>two</p>")).toBe("one two");
    expect(htmlToText("one<br>two")).toBe("one two");
    expect(htmlToText("<ul><li>alpha</li><li>beta</li></ul>")).toBe("alpha beta");
  });

  it("collapses whitespace including newlines and tabs", () => {
    expect(htmlToText("  one   two \n\t three  ")).toBe("one two three");
    expect(htmlToText("<p>one</p>\n\n<p>two</p>")).toBe("one two");
  });

  it("trims surrounding whitespace", () => {
    expect(htmlToText("   padded   ")).toBe("padded");
  });

  it("removes script contents entirely", () => {
    // The body must not become searchable text.
    expect(
      htmlToText("<p>keep</p><script>var secret = 1;</script>"),
    ).toBe("keep");
  });

  it("removes style contents entirely", () => {
    expect(
      htmlToText("<style>.a{color:red}</style><p>keep</p>"),
    ).toBe("keep");
  });

  it("removes noscript and template contents", () => {
    expect(htmlToText("<noscript>hidden</noscript><p>keep</p>")).toBe("keep");
    expect(htmlToText("<template>hidden</template><p>keep</p>")).toBe("keep");
  });

  it("removes an unclosed trailing script", () => {
    // A truncated payload must not leak the rest of the body.
    expect(htmlToText("<p>keep</p><script>leaked")).toBe("keep");
  });

  it("removes unclosed trailing style", () => {
    expect(htmlToText("<p>keep</p><style>.a")).toBe("keep");
  });

  it("strips inline formatting tags", () => {
    expect(htmlToText("<code>npm test</code>")).toBe("npm test");
    expect(htmlToText("<a href='http://x.test'>link text</a>")).toBe("link text");
  });

  it("leaves no attribute text behind", () => {
    expect(htmlToText('<a href="http://example.test">click</a>')).toBe("click");
  });

  it("decodes named entities", () => {
    expect(htmlToText("a &amp; b")).toBe("a & b");
    expect(htmlToText("&lt;tag&gt;")).toBe("<tag>");
    expect(htmlToText("&quot;quoted&quot;")).toBe('"quoted"');
    expect(htmlToText("it&apos;s")).toBe("it's");
    expect(htmlToText("a&nbsp;b")).toBe("a b");
  });

  it("decodes uppercase and mixed-case named entities", () => {
    expect(htmlToText("a &AMP; b")).toBe("a & b");
    expect(htmlToText("a &Amp; b")).toBe("a & b");
  });

  it("decodes numeric decimal entities", () => {
    expect(htmlToText("&#39;quoted&#39;")).toBe("'quoted'");
    expect(htmlToText("&#65;&#66;")).toBe("AB");
  });

  it("decodes numeric hex entities", () => {
    expect(htmlToText("&#x27;hex&#x27;")).toBe("'hex'");
    expect(htmlToText("&#X41;")).toBe("A");
  });

  it("leaves an unknown named entity verbatim", () => {
    // Dropping it would silently join the surrounding words together.
    expect(htmlToText("a &notreal; b")).toBe("a &notreal; b");
  });

  it("leaves an out-of-range code point verbatim", () => {
    // 0x110000 is one past the last valid code point.
    expect(htmlToText("a &#x110000; b")).toBe("a &#x110000; b");
  });

  it("returns empty string when the input is only markup", () => {
    expect(htmlToText("<p></p>")).toBe("");
    expect(htmlToText("<br>")).toBe("");
  });

  it("matches a real Tiptap description", () => {
    const html =
      "<h2>Context</h2><p>The <strong>login</strong> redirect drops the " +
      "<code>session</code> param.</p><ul><li>Reproduce on Safari</li></ul>";
    expect(htmlToText(html)).toBe(
      "Context The login redirect drops the session param. Reproduce on Safari",
    );
  });

  it("does not match on markup when searching for a tag name", () => {
    // This is the reason the function exists at all.
    expect(htmlToText("<p>text</p>")).not.toContain("p>");
    expect(htmlToText("<a href='http://x.test'>t</a>")).not.toContain("href");
  });
});