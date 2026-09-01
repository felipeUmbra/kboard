import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "s", "code", "pre",
  "h1", "h2", "h3", "h4",
  "ul", "ol", "li",
  "blockquote",
  "a",
];

const ALLOWED_ATTR = ["href", "target", "rel"];

/** Sanitize HTML produced by Tiptap before saving or rendering. */
export function sanitizeRichHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    KEEP_CONTENT: true,
  });
}
