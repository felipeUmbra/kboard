import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";
import { sanitizeRichHtml } from "./sanitize";

export function RichTextEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value || "",
    onUpdate: ({ editor: e }) => {
      onChange(sanitizeRichHtml(e.getHTML()));
    },
    editorProps: {
      attributes: {
        class: "rich-text-editor",
        "data-placeholder": placeholder ?? "",
        "aria-label": "Description",
      },
    },
  });

  // Re-sync if external value changes (e.g. switching cards)
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) {
      editor.commands.setContent(value || "", false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) {
    return <div className="rich-text-editor rich-text-editor--empty">Loading…</div>;
  }

  return (
    <div className="rich-text-wrapper">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;
  const btn = (active: boolean) =>
    `rich-text-toolbar__btn${active ? " is-active" : ""}`;

  return (
    <div className="rich-text-toolbar" role="toolbar" aria-label="Formatting">
      <button
        type="button"
        className={btn(editor.isActive("bold"))}
        onClick={() => editor.chain().focus().toggleBold().run()}
        aria-label="Bold"
        title="Bold"
      >
        <b>B</b>
      </button>
      <button
        type="button"
        className={btn(editor.isActive("italic"))}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        aria-label="Italic"
        title="Italic"
      >
        <i>I</i>
      </button>
      <button
        type="button"
        className={btn(editor.isActive("strike"))}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        aria-label="Strikethrough"
        title="Strikethrough"
      >
        <s>S</s>
      </button>
      <button
        type="button"
        className={btn(editor.isActive("code"))}
        onClick={() => editor.chain().focus().toggleCode().run()}
        aria-label="Inline code"
        title="Inline code"
      >
        {"</>"}
      </button>
      <span className="rich-text-toolbar__sep" />
      <button
        type="button"
        className={btn(editor.isActive("heading", { level: 1 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        aria-label="Heading 1"
        title="Heading 1"
      >
        H1
      </button>
      <button
        type="button"
        className={btn(editor.isActive("heading", { level: 2 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        aria-label="Heading 2"
        title="Heading 2"
      >
        H2
      </button>
      <span className="rich-text-toolbar__sep" />
      <button
        type="button"
        className={btn(editor.isActive("bulletList"))}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        aria-label="Bullet list"
        title="Bullet list"
      >
        •
      </button>
      <button
        type="button"
        className={btn(editor.isActive("orderedList"))}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        aria-label="Numbered list"
        title="Numbered list"
      >
        1.
      </button>
      <button
        type="button"
        className={btn(editor.isActive("blockquote"))}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        aria-label="Quote"
        title="Quote"
      >
        ❝
      </button>
      <button
        type="button"
        className={btn(editor.isActive("codeBlock"))}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        aria-label="Code block"
        title="Code block"
      >
        { }
      </button>
      <span className="rich-text-toolbar__sep" />
      <button
        type="button"
        className="rich-text-toolbar__btn"
        onClick={() => editor.chain().focus().undo().run()}
        aria-label="Undo"
        title="Undo"
      >
        ↶
      </button>
      <button
        type="button"
        className="rich-text-toolbar__btn"
        onClick={() => editor.chain().focus().redo().run()}
        aria-label="Redo"
        title="Redo"
      >
        ↷
      </button>
    </div>
  );
}
