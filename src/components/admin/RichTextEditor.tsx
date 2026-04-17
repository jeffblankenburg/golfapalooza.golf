"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Markdown } from "tiptap-markdown";
import { useEffect, useCallback, useState, useRef } from "react";

interface RichTextEditorProps {
  content: string; // markdown
  onChange: (markdown: string) => void;
}

interface StoredImage {
  name: string;
  url: string;
  created_at: string;
}

export function RichTextEditor({ content, onChange }: RichTextEditorProps) {
  const [linkUrl, setLinkUrl] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [existingImages, setExistingImages] = useState<StoredImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-green-700 underline font-medium" },
      }),
      Image.configure({
        HTMLAttributes: { class: "rounded-xl max-w-full" },
      }),
      Markdown.configure({
        html: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content,
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none p-3 min-h-[200px] text-gray-700 focus:outline-none",
      },
    },
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const md = (editor.storage as any).markdown.getMarkdown();
      onChange(md);
    },
  });

  // Sync content when it changes externally (e.g., loading a different article)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (editor && content !== (editor.storage as any).markdown.getMarkdown()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  const addLink = useCallback(() => {
    if (!editor || !linkUrl) return;
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: linkUrl })
      .run();
    setLinkUrl("");
    setShowLinkInput(false);
  }, [editor, linkUrl]);

  const openImagePicker = useCallback(async () => {
    setShowImagePicker(true);
    setLoadingImages(true);
    try {
      const res = await fetch("/api/admin/articles/upload-image");
      const data = await res.json();
      setExistingImages(data.images || []);
    } catch {
      setExistingImages([]);
    } finally {
      setLoadingImages(false);
    }
  }, []);

  const insertImage = useCallback((url: string) => {
    if (!editor) return;
    editor.chain().focus().setImage({ src: url }).run();
    setShowImagePicker(false);
  }, [editor]);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/admin/articles/upload-image", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.error) {
        console.error("Image upload failed:", data.error);
        return;
      }

      editor.chain().focus().setImage({ src: data.url }).run();
      setShowImagePicker(false);
    } catch {
      console.error("Image upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [editor]);

  if (!editor) return null;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 bg-gray-50 border border-gray-300 border-b-0 rounded-t-xl">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive("heading", { level: 2 })}
          title="Header"
        >
          H1
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive("heading", { level: 3 })}
          title="Subheader"
        >
          H2
        </ToolbarButton>
        <Divider />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Bold"
        >
          <span className="font-bold">B</span>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Italics"
        >
          <span className="italic">I</span>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          title="Underline"
        >
          <span className="underline">U</span>
        </ToolbarButton>
        <Divider />
        <ToolbarButton
          onClick={() => {
            if (editor.isActive("link")) {
              editor.chain().focus().unsetLink().run();
            } else {
              const existingHref = editor.getAttributes("link").href;
              setLinkUrl(existingHref || "https://");
              setShowLinkInput(true);
            }
          }}
          active={editor.isActive("link")}
          title="Link"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          onClick={openImagePicker}
          title="Insert Image"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Bulleted List"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="4" cy="6" r="1.5" />
            <circle cx="4" cy="12" r="1.5" />
            <circle cx="4" cy="18" r="1.5" />
            <rect x="8" y="5" width="13" height="2" rx="1" />
            <rect x="8" y="11" width="13" height="2" rx="1" />
            <rect x="8" y="17" width="13" height="2" rx="1" />
          </svg>
        </ToolbarButton>
      </div>

      {/* Link input popover */}
      {showLinkInput && (
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 border-x border-gray-300">
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addLink()}
            placeholder="https://example.com"
            autoFocus
            className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:outline-none"
          />
          <button onClick={addLink} className="px-3 py-1 bg-green-600 text-white text-xs font-semibold rounded-lg">
            Add
          </button>
          <button onClick={() => setShowLinkInput(false)} className="px-2 py-1 text-xs text-gray-500">
            Cancel
          </button>
        </div>
      )}

      {/* Hidden file input for image upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
      />

      {/* Image picker drawer */}
      {showImagePicker && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowImagePicker(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[80vh] flex flex-col animate-slide-up">
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            <div className="flex items-center justify-between px-4 pb-3">
              <h2 className="text-lg font-semibold">Insert Image</h2>
              <button onClick={() => setShowImagePicker(false)} className="w-8 h-8 flex items-center justify-center">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Upload new */}
            <div className="px-4 pb-4">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm font-semibold text-gray-600 active:bg-gray-50 disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Upload New Image
                  </>
                )}
              </button>
            </div>

            {/* Existing images */}
            <div className="flex-1 overflow-y-auto px-4 pb-6">
              {loadingImages ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : existingImages.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-4">No previously uploaded images.</p>
              ) : (
                <>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Previously Uploaded</p>
                  <div className="grid grid-cols-3 gap-2">
                    {existingImages.map((img) => (
                      <button
                        key={img.name}
                        onClick={() => insertImage(img.url)}
                        className="aspect-square rounded-xl border border-gray-200 overflow-hidden active:ring-2 active:ring-green-500 hover:ring-2 hover:ring-green-300 transition-shadow"
                      >
                        <img
                          src={img.url}
                          alt={img.name}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Editor area */}
      <div className="border border-gray-300 rounded-b-xl overflow-hidden">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function ToolbarButton({
  onClick,
  active,
  title,
  children,
  disabled,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-colors ${
        active
          ? "bg-green-100 text-green-700"
          : "text-gray-600 hover:bg-gray-200 active:bg-gray-300"
      } disabled:opacity-50`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-gray-300 mx-1" />;
}
