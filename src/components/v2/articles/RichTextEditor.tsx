"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Markdown } from "tiptap-markdown";
import { useEffect, useCallback, useState } from "react";
import { ArticleImageDrawer } from "./ArticleImageDrawer";
import styles from "@/app/new/new.module.css";

const SIZE_PRESETS: { label: string; value: string | null }[] = [
  { label: "Small", value: "33%" },
  { label: "Medium", value: "66%" },
  { label: "Full", value: null },
];

// Image with a `width` attribute that round-trips through markdown: when width is
// set it serializes as inline HTML so the style survives; otherwise it falls back
// to standard ![alt](src). Matches v1's format exactly so the reader (rehype-raw)
// renders authored + legacy content identically.
const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null as string | null,
        parseHTML: (el) => {
          const style = (el as HTMLElement).getAttribute("style") || "";
          const m = style.match(/width:\s*([^;]+)/i);
          if (m) return m[1].trim();
          return (el as HTMLElement).getAttribute("width") || null;
        },
        renderHTML: (attrs: { width?: string | null }) => {
          if (!attrs.width) return {};
          return { style: `width: ${attrs.width}` };
        },
      },
    };
  },
  addStorage() {
    const parent = this.parent?.() ?? {};
    return {
      ...parent,
      markdown: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        serialize(state: any, node: any) {
          const src: string | null = node.attrs.src;
          const alt: string = node.attrs.alt || "";
          const width: string | null = node.attrs.width;
          if (!src) return;
          if (width) {
            const escAlt = alt.replace(/"/g, "&quot;");
            const escSrc = src.replace(/"/g, "&quot;");
            state.write(`<img src="${escSrc}" alt="${escAlt}" style="width: ${width}">`);
          } else {
            const altText = alt.replace(/[[\]]/g, "");
            state.write(`![${altText}](${src})`);
          }
        },
        parse: {},
      },
    };
  },
});

// StarterKit has no video node; register one so raw <video> HTML renders as a
// player while authoring AND survives markdown round-trips.
const VideoNode = Node.create({
  name: "video",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      src: { default: null },
      controls: { default: true },
      playsinline: { default: true },
      preload: { default: "metadata" },
      style: { default: "width:100%" },
    };
  },
  parseHTML() {
    return [{ tag: "video[src]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["video", mergeAttributes(HTMLAttributes)];
  },
  addStorage() {
    return {
      markdown: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        serialize(state: any, node: any) {
          const src: string | null = node.attrs.src;
          if (!src) return;
          const escSrc = src.replace(/"/g, "&quot;");
          state.write(`<video src="${escSrc}" controls playsinline preload="metadata" style="width:100%"></video>`);
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});

export function RichTextEditor({
  content,
  orgId,
  onChange,
}: {
  content: string; // markdown
  orgId: string;
  onChange: (markdown: string) => void;
}) {
  const [linkUrl, setLinkUrl] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [imageSelected, setImageSelected] = useState(false);
  const [imageWidth, setImageWidth] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: "underline" } }),
      ResizableImage,
      VideoNode,
      Markdown.configure({ html: true, transformPastedText: true, transformCopiedText: true }),
    ],
    content,
    editorProps: {
      attributes: { class: "min-h-[220px] p-3 focus:outline-none" },
    },
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onChange((editor.storage as any).markdown.getMarkdown());
    },
  });

  // Sync when content changes externally (loading a different article).
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (editor && content !== (editor.storage as any).markdown.getMarkdown()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  // Track image selection to show the size bar.
  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const active = editor.isActive("image");
      setImageSelected(active);
      setImageWidth(active ? ((editor.getAttributes("image").width as string | null) ?? null) : null);
    };
    update();
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
    };
  }, [editor]);

  const setImageSize = useCallback(
    (width: string | null) => editor?.chain().focus().updateAttributes("image", { width }).run(),
    [editor],
  );

  const addLink = useCallback(() => {
    if (!editor || !linkUrl) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href: linkUrl }).run();
    setLinkUrl("");
    setShowLinkInput(false);
  }, [editor, linkUrl]);

  if (!editor) return null;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 bg-gray-50 border border-gray-300 border-b-0 rounded-t-xl">
        <TB onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Header">
          H1
        </TB>
        <TB onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Subheader">
          H2
        </TB>
        <Divider />
        <TB onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold">
          <span className="font-bold">B</span>
        </TB>
        <TB onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italics">
          <span className="italic">I</span>
        </TB>
        <TB onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline">
          <span className="underline">U</span>
        </TB>
        <Divider />
        <TB
          onClick={() => {
            if (editor.isActive("link")) {
              editor.chain().focus().unsetLink().run();
            } else {
              setLinkUrl((editor.getAttributes("link").href as string) || "https://");
              setShowLinkInput(true);
            }
          }}
          active={editor.isActive("link")}
          title="Link"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </TB>
        <TB onClick={() => setShowImagePicker(true)} title="Insert image or video">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </TB>
        <TB onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bulleted list">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="4" cy="6" r="1.5" />
            <circle cx="4" cy="12" r="1.5" />
            <circle cx="4" cy="18" r="1.5" />
            <rect x="8" y="5" width="13" height="2" rx="1" />
            <rect x="8" y="11" width="13" height="2" rx="1" />
            <rect x="8" y="17" width="13" height="2" rx="1" />
          </svg>
        </TB>
        <TB onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal line">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeWidth={2} d="M3 12h18" />
          </svg>
        </TB>
      </div>

      {/* Link input */}
      {showLinkInput && (
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 border-x border-gray-300">
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addLink()}
            placeholder="https://example.com"
            autoFocus
            className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-[var(--brand)]"
          />
          <button onClick={addLink} className="px-3 py-1 text-white text-xs font-semibold rounded-lg bg-[var(--brand)]">
            Add
          </button>
          <button onClick={() => setShowLinkInput(false)} className="px-3 py-1 text-xs font-semibold rounded-lg bg-gray-200 text-gray-700">
            Cancel
          </button>
        </div>
      )}

      {/* Image size bar */}
      {imageSelected && (
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 border-x border-gray-300">
          <span className="text-xs font-medium text-gray-500">Image size:</span>
          {SIZE_PRESETS.map((preset) => {
            const active = (imageWidth ?? null) === preset.value;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => setImageSize(preset.value)}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors"
                style={
                  active
                    ? { background: "color-mix(in srgb, var(--brand) 14%, transparent)", color: "var(--brand)" }
                    : undefined
                }
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Editor — reuse reader styles so WYSIWYG matches the published look.
          marginTop:0 overrides .articleBody's reader margin so the box sits flush
          under the toolbar. */}
      <div className={`${styles.articleBody} border border-gray-300 rounded-b-xl overflow-hidden`} style={{ marginTop: 0 }}>
        <EditorContent editor={editor} />
      </div>

      <ArticleImageDrawer
        open={showImagePicker}
        orgId={orgId}
        onSelect={(url) => {
          if (/\.(mp4|webm|mov)(\?|#|$)/i.test(url)) {
            const safe = url.replace(/"/g, "&quot;");
            editor
              .chain()
              .focus()
              .insertContent(`<video src="${safe}" controls playsinline preload="metadata" style="width:100%"></video>`)
              .run();
          } else {
            editor.chain().focus().setImage({ src: url }).run();
          }
          setShowImagePicker(false);
        }}
        onClose={() => setShowImagePicker(false)}
      />
    </div>
  );
}

function TB({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold text-gray-600 transition-colors hover:bg-gray-200"
      style={active ? { background: "color-mix(in srgb, var(--brand) 14%, transparent)", color: "var(--brand)" } : undefined}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-gray-300 mx-1" />;
}
