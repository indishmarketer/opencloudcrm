"use client";

import { useRef, useState, useEffect } from "react";
import { useEditor, EditorContent, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TiptapLink from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import TiptapImage from "@tiptap/extension-image";
import { extractYoutubeId } from "@/lib/youtube";
import GuideStepNodeView from "@/components/GuideStepNodeView";
import {
  GuideEditorContext,
  type GuideEditorPrompt,
  type GuideEditorSkill,
  type GuideEditorCategory,
  type GuideStepAttrs,
  type GuideEditorContextValue,
} from "@/components/guideEditorContext";

const HEADING_LEVELS = [2, 3, 4, 5, 6] as const;

// Same reasoning as the email editor's Image extension: an image can
// optionally be a link, e.g. a screenshot that links out to the tool it's
// showing.
const Image = TiptapImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      href: {
        default: null,
        parseHTML: (element: HTMLElement) => element.closest("a")?.getAttribute("href") || null,
        renderHTML: () => ({}),
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    const { href, ...imgAttrs } = HTMLAttributes;
    const img = ["img", { ...this.options.HTMLAttributes, ...imgAttrs }] as const;
    if (href) return ["a", { href, target: "_blank", rel: "noopener noreferrer" }, img];
    return img;
  },
});

// No official Tiptap node for this -- it's a small, self-contained block
// that renders a YouTube iframe, matching the same allowedIframeHostnames
// restriction (YouTube only) that sanitizeBlogHtml enforces on render.
const YoutubeEmbed = Node.create({
  name: "youtubeEmbed",
  group: "block",
  atom: true,
  addAttributes() {
    return { videoId: { default: null } };
  },
  parseHTML() {
    return [
      {
        tag: "div[data-youtube-embed]",
        getAttrs: (element) => ({ videoId: (element as HTMLElement).getAttribute("data-video-id") }),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const videoId = HTMLAttributes.videoId as string;
    return [
      "div",
      mergeAttributes({
        "data-youtube-embed": "",
        "data-video-id": videoId,
        class: "not-prose relative my-4 aspect-video w-full overflow-hidden rounded-2xl",
      }),
      [
        "iframe",
        {
          src: `https://www.youtube.com/embed/${videoId}`,
          title: "Embedded video",
          class: "absolute inset-0 h-full w-full",
          allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
          allowfullscreen: "true",
          frameborder: "0",
        },
      ],
    ];
  },
});

// The step editor: this node IS the "one editor, one place" surface the
// owner asked for -- a prompt/skill attached to this guide, with its
// timestamp and instruction, lives as a regular block right in the
// write-up's document flow instead of a separate list below it. See
// src/lib/guideBody.ts's splitGuideBody for how the public page reads the
// data-* attributes this serializes back out.
const GuideStep = Node.create({
  name: "guideStep",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      itemType: { default: "prompt" },
      refId: { default: null },
      timestampLabel: { default: "" },
      instruction: { default: "" },
    };
  },
  parseHTML() {
    return [
      {
        tag: "div[data-guide-step]",
        getAttrs: (el) => {
          const element = el as HTMLElement;
          const refIdRaw = element.getAttribute("data-ref-id");
          return {
            itemType: element.getAttribute("data-item-type") === "skill" ? "skill" : "prompt",
            refId: refIdRaw ? Number(refIdRaw) : null,
            timestampLabel: element.getAttribute("data-timestamp") || "",
            instruction: decodeURIComponent(element.getAttribute("data-instruction") || ""),
          };
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes({
        "data-guide-step": "",
        "data-item-type": HTMLAttributes.itemType,
        "data-ref-id": HTMLAttributes.refId ?? "",
        "data-timestamp": HTMLAttributes.timestampLabel || "",
        "data-instruction": encodeURIComponent(HTMLAttributes.instruction || ""),
        class: "not-prose",
      }),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(GuideStepNodeView as unknown as (props: NodeViewProps) => React.ReactElement);
  },
});

function LinkPrompt({ onSubmit, onClose }: { onSubmit: (url: string) => void; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit() {
    if (url.trim()) onSubmit(url.trim());
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 px-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-line bg-paper p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-medium">Link URL</p>
        <input
          ref={inputRef}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="https://..."
          className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-line px-4 py-2 text-sm font-medium transition-colors hover:border-ink">
            Cancel
          </button>
          <button type="button" onClick={submit} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90">
            Add link
          </button>
        </div>
      </div>
    </div>
  );
}

function YoutubePrompt({ onSubmit, onClose }: { onSubmit: (videoId: string) => void; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit() {
    const videoId = extractYoutubeId(url);
    if (!videoId) {
      setError("Couldn't find a video in that URL.");
      return;
    }
    onSubmit(videoId);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 px-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-line bg-paper p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-medium">Embed a YouTube video</p>
        <input
          ref={inputRef}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="https://youtube.com/watch?v=..."
          className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
        />
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-line px-4 py-2 text-sm font-medium transition-colors hover:border-ink">
            Cancel
          </button>
          <button type="button" onClick={submit} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90">
            Embed
          </button>
        </div>
      </div>
    </div>
  );
}

function ImagePrompt({ onSubmit, onClose }: { onSubmit: (alt: string, href: string | null) => void; onClose: () => void }) {
  const [alt, setAlt] = useState("");
  const [href, setHref] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit() {
    if (!alt.trim()) return;
    onSubmit(alt.trim(), href.trim() || null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 px-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-line bg-paper p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-medium">Image</p>
        <input
          ref={inputRef}
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          placeholder="Describe the image (required, for accessibility and SEO)"
          className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <input
          value={href}
          onChange={(e) => setHref(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Optional: make it a link (leave blank for none)"
          className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-line px-4 py-2 text-sm font-medium transition-colors hover:border-ink">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={!alt.trim()} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50">
            Choose image...
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GuideRichTextEditor({
  value,
  onChange,
  onStepsChange,
  prompts,
  skills,
  categories,
  onCreateItem,
  onToggleLibrary,
}: {
  value: string;
  onChange: (html: string) => void;
  onStepsChange: (steps: GuideStepAttrs[]) => void;
  prompts: GuideEditorPrompt[];
  skills: GuideEditorSkill[];
  categories: GuideEditorCategory[];
  onCreateItem: GuideEditorContextValue["onCreateItem"];
  onToggleLibrary: GuideEditorContextValue["onToggleLibrary"];
}) {
  const [linkPromptOpen, setLinkPromptOpen] = useState(false);
  const [imagePromptOpen, setImagePromptOpen] = useState(false);
  const [youtubePromptOpen, setYoutubePromptOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingImage = useRef<{ alt: string; href: string | null } | null>(null);

  function collectSteps(editorInstance: NonNullable<ReturnType<typeof useEditor>>) {
    const steps: GuideStepAttrs[] = [];
    editorInstance.state.doc.descendants((node) => {
      if (node.type.name === "guideStep") {
        steps.push({
          itemType: node.attrs.itemType,
          refId: node.attrs.refId,
          timestampLabel: node.attrs.timestampLabel,
          instruction: node.attrs.instruction,
        });
      }
    });
    return steps;
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [...HEADING_LEVELS] } }),
      TiptapLink.configure({ openOnClick: false }),
      Underline,
      Image.configure({ HTMLAttributes: { style: "max-width:100%;height:auto;border-radius:8px;" } }),
      YoutubeEmbed,
      GuideStep,
    ],
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
      onStepsChange(collectSteps(editor));
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-neutral max-w-none min-h-[280px] px-4 py-3 focus:outline-none prose-headings:font-display prose-a:text-ink prose-a:underline",
      },
      handleClickOn: () => true,
      handleDOMEvents: {
        click: (_view, event) => {
          const target = event.target as HTMLElement;
          if (target.closest("a")) {
            event.preventDefault();
            return true;
          }
          return false;
        },
      },
    },
  });

  // onUpdate only fires on edits -- run once after the editor mounts so
  // the parent's steps state is seeded from whatever content was loaded
  // in (including legacy guides converted to step nodes on open).
  useEffect(() => {
    if (editor) onStepsChange(collectSteps(editor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  if (!editor) return null;

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const pending = pendingImage.current;
    pendingImage.current = null;
    e.target.value = "";
    if (!file || !pending) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/console/prompt-library/guides/image-upload", { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    setUploading(false);
    if (res.ok && body.url) {
      editor
        ?.chain()
        .focus()
        .insertContent({ type: "image", attrs: { src: body.url, alt: pending.alt, href: pending.href } })
        .run();
    }
  }

  function insertStep() {
    editor
      ?.chain()
      .focus()
      .insertContent({ type: "guideStep", attrs: { itemType: "prompt", refId: null, timestampLabel: "", instruction: "" } })
      .run();
  }

  function btnClass(active: boolean) {
    return `rounded-md px-2.5 py-1.5 text-sm font-medium ${active ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-soft"}`;
  }

  return (
    <GuideEditorContext.Provider value={{ prompts, skills, categories, onCreateItem, onToggleLibrary }}>
      <div className="overflow-hidden rounded-xl border border-line">
        <div className="flex flex-wrap items-center gap-1 border-b border-line bg-paper-soft p-2">
          {HEADING_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
              className={btnClass(editor.isActive("heading", { level }))}
            >
              H{level}
            </button>
          ))}
          <div className="mx-1 h-5 w-px bg-line" />
          <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btnClass(editor.isActive("bold"))}>
            Bold
          </button>
          <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btnClass(editor.isActive("italic"))}>
            Italic
          </button>
          <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={btnClass(editor.isActive("underline"))}>
            Underline
          </button>
          <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={btnClass(editor.isActive("strike"))}>
            Strike
          </button>
          <button type="button" onClick={() => editor.chain().focus().toggleCode().run()} className={btnClass(editor.isActive("code"))}>
            Code
          </button>
          <div className="mx-1 h-5 w-px bg-line" />
          <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btnClass(editor.isActive("bulletList"))}>
            Bullet list
          </button>
          <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btnClass(editor.isActive("orderedList"))}>
            Numbered list
          </button>
          <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btnClass(editor.isActive("blockquote"))}>
            Quote
          </button>
          <button type="button" onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={btnClass(editor.isActive("codeBlock"))}>
            Code block
          </button>
          <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()} className={btnClass(false)}>
            Divider
          </button>
          <div className="mx-1 h-5 w-px bg-line" />
          <button type="button" onClick={() => setLinkPromptOpen(true)} className={btnClass(editor.isActive("link"))}>
            Link
          </button>
          <button type="button" onClick={() => setImagePromptOpen(true)} disabled={uploading} className={`${btnClass(false)} disabled:opacity-50`}>
            {uploading ? "Uploading..." : "Image"}
          </button>
          <button type="button" onClick={() => setYoutubePromptOpen(true)} className={btnClass(false)}>
            YouTube
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImagePick} className="hidden" />
          <div className="mx-1 h-5 w-px bg-line" />
          <button
            type="button"
            onClick={insertStep}
            className="rounded-md bg-ink px-2.5 py-1.5 text-sm font-medium text-paper transition-opacity hover:opacity-80"
          >
            + Insert step
          </button>
        </div>
        <EditorContent editor={editor} />
        {linkPromptOpen && (
          <LinkPrompt onSubmit={(url) => editor.chain().focus().setLink({ href: url }).run()} onClose={() => setLinkPromptOpen(false)} />
        )}
        {imagePromptOpen && (
          <ImagePrompt
            onSubmit={(alt, href) => {
              pendingImage.current = { alt, href };
              fileInputRef.current?.click();
            }}
            onClose={() => setImagePromptOpen(false)}
          />
        )}
        {youtubePromptOpen && (
          <YoutubePrompt
            onSubmit={(videoId) => editor.chain().focus().insertContent({ type: "youtubeEmbed", attrs: { videoId } }).run()}
            onClose={() => setYoutubePromptOpen(false)}
          />
        )}
      </div>
    </GuideEditorContext.Provider>
  );
}
