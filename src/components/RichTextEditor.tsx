"use client";

import { useState, useRef, useEffect } from "react";
import { useEditor, EditorContent, NodeViewWrapper, ReactNodeViewRenderer, ReactRenderer, type NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapLink from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import TiptapImage from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import { Placeholder } from "@tiptap/extensions/placeholder";
import { Extension, Node, nodePasteRule, type Editor } from "@tiptap/core";
import { Suggestion, type SuggestionProps } from "@tiptap/suggestion";
import BrandSelect from "@/components/BrandSelect";

// Brand colors only -- owner's explicit rule: no free-form color picker,
// just black (default ink) and red (accent), nothing else.
const BRAND_COLORS = [
  { label: "Black", value: "#0a0a0a" },
  { label: "Red", value: "#dc2626" },
];

// A curated set rather than a full emoji-picker dependency -- covers the
// common cases (reactions, gestures, status, objects) without adding a
// library just for this.
const EMOJI_PICKS = [
  "🙂", "😀", "😂", "😍", "🤔", "😅", "😉", "😎", "🥳", "😢", "😮", "🙌",
  "👍", "👎", "👏", "🙏", "💪", "🤝", "✌️", "👋", "🔥", "✨", "🎉", "💡",
  "✅", "❌", "⚠️", "❓", "❗", "⭐", "💯", "🚀", "📈", "📉", "⏰", "📌",
  "💰", "💻", "📱", "🤖", "🧠", "🔒", "📝", "📊", "🗂️", "🔗", "🎯", "🏆",
  "👉", "👈", "👆", "👇", "➡️", "⬅️", "⬆️", "⬇️", "↗️", "↘️", "🔄", "📍",
];

const BUTTON_STYLE =
  "display:inline-block;white-space:nowrap;background:#0a0a0a;color:#f7f4f0;padding:12px 28px;border-radius:999px;text-decoration:none;font-weight:600;";

type EmbedProvider = "YouTube" | "Vimeo" | "Spotify" | "X" | "Link";
type EmbedInfo = { href: string; provider: EmbedProvider; embedUrl: string | null };

function getEmbedInfo(rawUrl: string): EmbedInfo | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const href = url.href;
    const youtubeId = url.pathname.match(/(?:^|\/)(?:embed\/|shorts\/|live\/)?([a-zA-Z0-9_-]{11})$/)?.[1]
      || url.searchParams.get("v")?.match(/^[a-zA-Z0-9_-]{11}$/)?.[0];
    if ((host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be") && youtubeId) {
      return { href, provider: "YouTube", embedUrl: `https://www.youtube.com/embed/${youtubeId}` };
    }
    const spotify = host === "open.spotify.com"
      ? url.pathname.match(/^\/(?:embed\/)?(episode|show|track|album|playlist|artist)\/([A-Za-z0-9]+)\/?$/)
      : null;
    if (spotify) return { href, provider: "Spotify", embedUrl: `https://open.spotify.com/embed/${spotify[1]}/${spotify[2]}` };
    const vimeoId = (host === "vimeo.com" || host === "player.vimeo.com")
      ? url.pathname.match(/\/(?:video\/)?(\d+)\/?$/)?.[1]
      : null;
    if (vimeoId) return { href, provider: "Vimeo", embedUrl: `https://player.vimeo.com/video/${vimeoId}` };
    if ((host === "x.com" || host === "twitter.com") && /\/[^/]+\/status\/\d+/.test(url.pathname)) {
      return { href, provider: "X", embedUrl: null };
    }
    return { href, provider: "Link", embedUrl: null };
  } catch {
    return null;
  }
}

function VideoEmbedNodeView({ node, updateAttributes }: NodeViewProps) {
  const [url, setUrl] = useState(String(node.attrs.href || ""));
  const [error, setError] = useState("");
  const embed = node.attrs.href ? getEmbedInfo(String(node.attrs.href)) : null;

  function applyEmbed() {
    const next = getEmbedInfo(url.trim());
    if (!next) {
      setError("Enter a valid HTTPS link.");
      return;
    }
    updateAttributes({ href: next.href, provider: next.provider, embedUrl: next.embedUrl });
    setUrl(next.href);
    setError("");
  }

  return (
    <NodeViewWrapper className="my-6">
      <div className="overflow-hidden rounded-xl border border-line bg-white">
        {embed?.embedUrl ? (
          <>
            <div className={`relative bg-paper-soft ${embed.provider === "Spotify" ? "h-[352px]" : "aspect-video"}`}>
              <iframe
                src={embed.embedUrl}
                title={`${embed.provider} embed`}
                className="absolute inset-0 h-full w-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2">
              <a href={embed.href} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-xs text-ink-soft underline">Open on {embed.provider}</a>
              <button type="button" onClick={() => { updateAttributes({ href: null, provider: null, embedUrl: null }); setError(""); }} className="shrink-0 rounded-md px-2 py-1 text-xs font-medium hover:bg-paper-soft">Change embed</button>
            </div>
          </>
        ) : embed ? (
          <div className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <p className="font-semibold">{embed.provider} link</p>
              <a href={embed.href} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate text-sm text-ink-soft underline">{embed.href}</a>
            </div>
            <button type="button" onClick={() => updateAttributes({ href: null, provider: null, embedUrl: null })} className="shrink-0 rounded-lg border border-line px-3 py-2 text-sm hover:border-ink">Change</button>
          </div>
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-[minmax(180px,268px)_1fr] sm:items-center sm:p-5">
            <div className="flex aspect-video items-center justify-center rounded-lg bg-paper-soft text-ink-soft">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-12 w-12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="font-semibold">Video embed</p>
              <p className="mt-1 text-sm leading-5 text-ink-soft">Paste a YouTube, Vimeo, or Spotify link to embed it. Other HTTPS links become a link card.</p>
              <div className="mt-3 flex gap-2">
                <input
                  aria-label="Video or media URL"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && applyEmbed()}
                  placeholder="https://"
                  className="min-w-0 flex-1 rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink"
                />
                <button type="button" onClick={applyEmbed} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:border-ink">Embed</button>
              </div>
              {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

const EmbedCard = Node.create({
  name: "embedCard",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      href: { default: null },
      provider: { default: null },
      embedUrl: { default: null },
    };
  },
  parseHTML() {
    const getAttrs = (element: string | HTMLElement) => {
      const node = element as HTMLElement;
      const url = node.querySelector("iframe[src]")?.getAttribute("src") || node.querySelector("a[href]")?.getAttribute("href") || "";
      const info = getEmbedInfo(url);
      return info ? { href: info.href, provider: info.provider, embedUrl: info.embedUrl } : false;
    };
    return [
      { tag: "div.blog-video-embed", getAttrs },
      { tag: "div.embed-card", getAttrs },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const info = getEmbedInfo(HTMLAttributes.href || "");
    if (!info) return ["p", {}, ""];
    if (info.embedUrl) {
      return ["div", { class: "blog-video-embed" }, ["iframe", {
        src: info.embedUrl,
        title: `${info.provider} embed`,
        width: "100%",
        height: info.provider === "Spotify" ? "352" : "480",
        allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
        allowfullscreen: "true",
        referrerpolicy: "strict-origin-when-cross-origin",
        class: "blog-video-embed-frame",
      }]];
    }
    return ["div", { class: "blog-video-embed" }, ["a", {
      href: info.href,
      target: "_blank",
      rel: "noopener noreferrer",
      class: "blog-video-embed-link",
    }, ["strong", {}, `${info.provider} link`], ["span", {}, "Open in a new tab →"]]];
  },
  addNodeView() {
    return ReactNodeViewRenderer(VideoEmbedNodeView);
  },
  addPasteRules() {
    return [nodePasteRule({
      find: /https:\/\/[^\s<>]+/gi,
      type: this.type,
      getAttributes: (match) => {
        const href = match[0].replace(/[),.!?]+$/, "");
        const info = getEmbedInfo(href);
        return info && info.provider !== "YouTube" ? { href: info.href, provider: info.provider, embedUrl: info.embedUrl } : false;
      },
    })];
  },
});

function TableOfContentsNodeView({ deleteNode }: NodeViewProps) {
  return (
    <NodeViewWrapper className="my-4 rounded-2xl border border-dashed border-line bg-paper-soft p-4" contentEditable={false}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-ink">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" /></svg>
          Table of contents
        </div>
        <button type="button" onClick={() => deleteNode()} className="text-xs font-medium text-ink-soft hover:text-red-600">Remove</button>
      </div>
      <p className="mt-1.5 text-xs text-ink-soft">Automatically lists this post&apos;s headings (3 or more) once published -- nothing to maintain by hand.</p>
    </NodeViewWrapper>
  );
}

// Saved as an empty marker div (class="blog-toc-marker") -- tableOfContents.ts
// replaces it with the real rendered nav at publish-render time, built
// from whatever H2/H3 headings the post actually has then. This node is
// just where the author chose to drop it; it carries no content of its
// own and is never itself editable.
const TableOfContentsBlock = Node.create({
  name: "tableOfContents",
  group: "block",
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: "div.blog-toc-marker" }];
  },
  renderHTML() {
    return ["div", { class: "blog-toc-marker" }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(TableOfContentsNodeView);
  },
});

function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-ink transition-colors hover:bg-paper-soft ${active ? "bg-paper-soft" : ""}`}
    >
      {children}
    </button>
  );
}

/** Fixed-position popover anchored to a toolbar button's own rect, so it
 * escapes the toolbar's clipping (see the note on moreAnchor/emojiAnchor
 * above) instead of being absolutely positioned inside it. */
function ToolbarPopover({
  anchor,
  align,
  onClose,
  children,
}: {
  anchor: DOMRect;
  align: "left" | "right";
  onClose: () => void;
  children: React.ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as globalThis.Node)) onClose();
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [onClose]);

  const top = anchor.bottom + 4;
  const style: React.CSSProperties = align === "left" ? { top, left: anchor.left } : { top, right: window.innerWidth - anchor.right };

  return (
    <div ref={boxRef} style={{ position: "fixed", ...style }} className="z-[90] rounded-xl border border-line bg-white shadow-lg">
      {children}
    </div>
  );
}

function BlogToolbar({
  editor,
  onLink,
  onImage,
  onButton,
  onDeletePost,
}: {
  editor: Editor;
  onLink: () => void;
  onImage: () => void;
  onButton: () => void;
  onDeletePost?: () => void;
}) {
  // Rect of the button that opened each popover, not a plain boolean --
  // the toolbar's overflow-x-auto forces the browser to also compute
  // overflow-y as auto (a scrollable axis can't sit next to a visible
  // one), so an absolutely-positioned dropdown anchored inside the
  // toolbar gets clipped the moment it extends past the 48px bar. These
  // render with position:fixed from the button's own rect instead, which
  // escapes that clipping entirely.
  const [moreAnchor, setMoreAnchor] = useState<DOMRect | null>(null);
  const [emojiAnchor, setEmojiAnchor] = useState<DOMRect | null>(null);
  const block = editor.isActive("heading", { level: 1 }) ? "h1"
    : editor.isActive("heading", { level: 2 }) ? "h2"
    : editor.isActive("heading", { level: 3 }) ? "h3"
    : editor.isActive("heading", { level: 4 }) ? "h4" : "p";
  const blockOptions = [
    { value: "p", label: "Paragraph" },
    { value: "h1", label: "Heading 1" },
    { value: "h2", label: "Heading 2" },
    { value: "h3", label: "Heading 3" },
    { value: "h4", label: "Heading 4" },
  ];

  function setBlock(value: string) {
    const chain = editor.chain().focus();
    if (value === "p") chain.setParagraph().run();
    else chain.toggleHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 | 4 }).run();
  }

  return (
    <>
    <div className="blog-toolbar-scroll relative flex h-12 shrink-0 flex-nowrap items-center gap-1 overflow-x-auto border-y border-line bg-white px-6 sm:px-12 xl:px-16">
      <BrandSelect value={block} onChange={setBlock} options={blockOptions} compact className="w-32 shrink-0" />
      <span className="mx-1 h-6 w-px shrink-0 bg-line" />
      <ToolButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><span className="font-black">B</span></ToolButton>
      <ToolButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><span className="font-serif text-base italic">I</span></ToolButton>
      <ToolButton label="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><span className="underline">U</span></ToolButton>
      <ToolButton label="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><span className="line-through">S</span></ToolButton>
      <ToolButton label="Add link" active={editor.isActive("link")} onClick={onLink}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 13.5a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.7 1.7M14 10.5a4.5 4.5 0 0 0-6.4 0l-3 3A4.5 4.5 0 0 0 11 20l1.7-1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </ToolButton>
      <span className="mx-1 h-6 w-px shrink-0 bg-line" />
      <ToolButton label="Bulleted list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="5" cy="6" r="1" fill="currentColor"/><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="5" cy="18" r="1" fill="currentColor"/><path d="M10 6h9M10 12h9M10 18h9"/></svg>
      </ToolButton>
      <ToolButton label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10 6h9M10 12h9M10 18h9M4 5h2v3M4 11h2l-2 2h2M4 17c0-1 2-1 2 0s-2 1-2 2h2"/></svg>
      </ToolButton>
      <ToolButton label="Block quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M7.2 5.5C4.6 7.2 3.4 9.5 3.4 12.1c0 2.7 1.5 4.4 3.7 4.4 2 0 3.4-1.4 3.4-3.4 0-1.8-1.2-3-2.9-3.1.1-1.1.7-2 1.8-2.8L7.2 5.5Zm9.5 0c-2.6 1.7-3.8 4-3.8 6.6 0 2.7 1.5 4.4 3.7 4.4 2 0 3.4-1.4 3.4-3.4 0-1.8-1.2-3-2.9-3.1.1-1.1.7-2 1.8-2.8l-2.2-1.7Z"/></svg>
      </ToolButton>
      <ToolButton label="Code block" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><span className="font-mono text-xs">&lt;/&gt;</span></ToolButton>
      <span className="mx-1 h-6 w-px shrink-0 bg-line" />
      <ToolButton label="Insert image or search Pexels" onClick={onImage}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 3-3 4 4" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </ToolButton>
      <ToolButton label="Insert video or embed" onClick={() => editor.chain().focus().insertContent({ type: "embedCard", attrs: {} }).run()}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none"/></svg>
      </ToolButton>
      <ToolButton label="Insert divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}><span className="block h-px w-4 bg-current" /></ToolButton>
      <ToolButton label="Insert table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M3 10h18M3 16h18M9 4v16M15 4v16" /></svg>
      </ToolButton>
      <ToolButton label="Insert table of contents" onClick={() => editor.chain().focus().insertContent({ type: "tableOfContents" }).run()}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" /></svg>
      </ToolButton>
      <ToolButton label="Insert emoji" active={!!emojiAnchor} onClick={(event) => setEmojiAnchor((prev) => (prev ? null : event.currentTarget.getBoundingClientRect()))}>
        <span className="text-base leading-none">🙂</span>
      </ToolButton>
      <span className="mx-1 h-6 w-px shrink-0 bg-line" />
      <ToolButton label="Undo" onClick={() => editor.chain().focus().undo().run()}><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 5 10l4-4"/><path d="M5 10h8a6 6 0 0 1 0 12h-2"/></svg></ToolButton>
      <ToolButton label="Redo" onClick={() => editor.chain().focus().redo().run()}><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m15 14 4-4-4-4"/><path d="M19 10h-8a6 6 0 0 0 0 12h2"/></svg></ToolButton>
      <span className="min-w-2 flex-1" />
      <ToolButton label="More formatting" active={!!moreAnchor} onClick={(event) => setMoreAnchor((prev) => (prev ? null : event.currentTarget.getBoundingClientRect()))}><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></ToolButton>
    </div>
    {emojiAnchor && (
      <ToolbarPopover anchor={emojiAnchor} align="left" onClose={() => setEmojiAnchor(null)}>
        <div className="grid w-[min(300px,calc(100vw-24px))] grid-cols-8 gap-1 p-2">
          {EMOJI_PICKS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => { editor.chain().focus().insertContent(emoji).run(); setEmojiAnchor(null); }}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-lg hover:bg-paper-soft"
            >
              {emoji}
            </button>
          ))}
        </div>
      </ToolbarPopover>
    )}
    {moreAnchor && (
      <ToolbarPopover anchor={moreAnchor} align="right" onClose={() => setMoreAnchor(null)}>
        <div className="flex items-center gap-2 p-2">
          <button type="button" onClick={() => { onButton(); setMoreAnchor(null); }} className="rounded-lg px-3 py-2 text-sm hover:bg-paper-soft">Button</button>
          {BRAND_COLORS.map((color) => (
            <button key={color.value} type="button" aria-label={`Text color ${color.label}`} title={color.label} onClick={() => editor.chain().focus().setColor(color.value).run()} className="h-7 w-7 rounded-full border border-line" style={{ backgroundColor: color.value }} />
          ))}
          <button type="button" onClick={() => editor.chain().focus().unsetColor().run()} className="rounded-lg px-2 py-2 text-xs text-ink-soft hover:bg-paper-soft">Reset</button>
          {onDeletePost && (
            <>
              <span className="h-6 w-px bg-line" />
              <button type="button" onClick={() => { setMoreAnchor(null); onDeletePost(); }} className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-paper-soft">Delete post</button>
            </>
          )}
        </div>
      </ToolbarPopover>
    )}
    {editor.isActive("table") && (
      <div className="flex h-10 shrink-0 flex-nowrap items-center gap-1 overflow-x-auto border-b border-line bg-paper-soft px-6 text-xs sm:px-12 xl:px-16">
        <span className="shrink-0 font-medium text-ink-soft">Table:</span>
        <button type="button" onClick={() => editor.chain().focus().addRowAfter().run()} className="shrink-0 rounded-md px-2 py-1 font-medium hover:bg-white">+ Row</button>
        <button type="button" onClick={() => editor.chain().focus().addColumnAfter().run()} className="shrink-0 rounded-md px-2 py-1 font-medium hover:bg-white">+ Column</button>
        <button type="button" onClick={() => editor.chain().focus().deleteRow().run()} className="shrink-0 rounded-md px-2 py-1 font-medium hover:bg-white">Delete row</button>
        <button type="button" onClick={() => editor.chain().focus().deleteColumn().run()} className="shrink-0 rounded-md px-2 py-1 font-medium hover:bg-white">Delete column</button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeaderRow().run()} className="shrink-0 rounded-md px-2 py-1 font-medium hover:bg-white">Toggle header row</button>
        <button type="button" onClick={() => editor.chain().focus().deleteTable().run()} className="shrink-0 rounded-md px-2 py-1 font-medium text-red-600 hover:bg-white">Delete table</button>
      </div>
    )}
    </>
  );
}

type SlashItem = {
  id: string;
  label: string;
  description: string;
  keywords: string;
  run: (editor: Editor, openImagePicker: () => void) => void;
};

const SLASH_ITEMS: SlashItem[] = [
  { id: "paragraph", label: "Paragraph", description: "Start a plain text block", keywords: "text normal", run: (editor) => editor.chain().focus().setParagraph().run() },
  { id: "h1", label: "Heading 1", description: "Add a large section heading", keywords: "heading title h1", run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run() },
  { id: "h2", label: "Heading 2", description: "Add a section heading", keywords: "heading h2", run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run() },
  { id: "h3", label: "Heading 3", description: "Add a smaller heading", keywords: "heading h3", run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run() },
  { id: "bullet", label: "Bulleted list", description: "Create a simple list", keywords: "list bullets", run: (editor) => editor.chain().focus().toggleBulletList().run() },
  { id: "numbered", label: "Numbered list", description: "Create a numbered list", keywords: "ordered list numbers", run: (editor) => editor.chain().focus().toggleOrderedList().run() },
  { id: "quote", label: "Blockquote", description: "Quote a passage", keywords: "quote blockquote", run: (editor) => editor.chain().focus().toggleBlockquote().run() },
  { id: "code", label: "Code block", description: "Insert formatted code", keywords: "code snippet", run: (editor) => editor.chain().focus().toggleCodeBlock().run() },
  { id: "divider", label: "Divider", description: "Separate sections", keywords: "horizontal rule line", run: (editor) => editor.chain().focus().setHorizontalRule().run() },
  { id: "table", label: "Table", description: "Insert a 3x3 table", keywords: "table grid rows columns", run: (editor) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { id: "toc", label: "Table of contents", description: "Lists this post's headings here", keywords: "toc contents outline navigation headings", run: (editor) => editor.chain().focus().insertContent({ type: "tableOfContents" }).run() },
  { id: "image", label: "Image", description: "Upload an image or search Pexels", keywords: "photo upload pexels media", run: (_editor, openImagePicker) => openImagePicker() },
  { id: "video", label: "Video or embed", description: "Embed a YouTube, Vimeo, Spotify, or other link", keywords: "youtube vimeo spotify x embed", run: (editor) => editor.chain().focus().insertContent({ type: "embedCard", attrs: {} }).run() },
];

function SlashMenu({
  items,
  command,
  selectedIndex,
}: {
  items: SlashItem[];
  command: (item: SlashItem) => void;
  selectedIndex: number;
}) {
  return (
    <div className="max-h-[min(60vh,420px)] w-[min(340px,calc(100vw-24px))] overflow-y-auto rounded-xl border border-line bg-white p-2 shadow-xl" role="listbox" aria-label="Insert a block">
      {items.length ? items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={index === selectedIndex}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => command(item)}
          className={`flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2.5 text-left ${index === selectedIndex ? "bg-paper-soft" : "hover:bg-paper-soft"}`}
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink">{item.label}</span>
            <span className="mt-0.5 block truncate text-xs text-ink-soft">{item.description}</span>
          </span>
          <span className="shrink-0 rounded bg-paper-soft px-1.5 py-0.5 text-[10px] text-ink-soft">↵</span>
        </button>
      )) : <p className="px-3 py-4 text-sm text-ink-soft">No matching blocks.</p>}
    </div>
  );
}

const SlashCommands = Extension.create<{ openImagePicker: () => void }>({
  name: "slashCommands",
  addOptions() {
    return { openImagePicker: () => undefined };
  },
  addProseMirrorPlugins() {
    const openImagePicker = this.options.openImagePicker;
    return [Suggestion<SlashItem>({
      editor: this.editor,
      char: "/",
      startOfLine: false,
      items: ({ query }) => {
        const normalized = query.toLowerCase().trim();
        return SLASH_ITEMS.filter((item) => `${item.label} ${item.keywords}`.toLowerCase().includes(normalized));
      },
      command: ({ editor, range, props }) => {
        editor.chain().focus().deleteRange(range).run();
        props.run(editor, openImagePicker);
      },
      render: () => {
        let component: ReactRenderer<{ items: SlashItem[]; command: (item: SlashItem) => void; selectedIndex: number }> | null = null;
        let unmount: (() => void) | null = null;
        let current: SuggestionProps<SlashItem> | null = null;
        let selectedIndex = 0;
        const update = () => {
          if (!component || !current) return;
          selectedIndex = Math.min(selectedIndex, Math.max(0, current.items.length - 1));
          component.updateProps({ items: current.items, command: current.command, selectedIndex });
        };

        return {
          onStart(props) {
            current = props;
            selectedIndex = 0;
            component = new ReactRenderer(SlashMenu, {
              editor: props.editor,
              props: { items: props.items, command: props.command, selectedIndex },
            });
            unmount = props.mount(component.element);
          },
          onUpdate(props) {
            const changedQuery = current?.query !== props.query;
            current = props;
            if (changedQuery) selectedIndex = 0;
            update();
          },
          onExit() {
            unmount?.();
            component?.destroy();
            component = null;
            current = null;
          },
          onKeyDown({ event }) {
            if (event.key === "ArrowDown" && current?.items.length) {
              selectedIndex = (selectedIndex + 1) % current.items.length;
              update();
              return true;
            }
            if (event.key === "ArrowUp" && current?.items.length) {
              selectedIndex = (selectedIndex - 1 + current.items.length) % current.items.length;
              update();
              return true;
            }
            if (event.key === "Enter" && current?.items[selectedIndex]) {
              current.command(current.items[selectedIndex]);
              return true;
            }
            return false;
          },
        };
      },
    })];
  },
});

// The stock Link mark's schema only knows href/target/rel/class -- an
// inline style (e.g. the pill-button CTA generated for blog-post
// campaigns) silently vanishes the moment this editor parses existing
// content, then vanishes for good the next time it's saved. Same failure
// mode as the image tag before the Image extension was added.
const Link = TiptapLink.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      style: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("style"),
        renderHTML: (attributes: { style?: string | null }) =>
          attributes.style ? { style: attributes.style } : {},
      },
      // Full per-link control (dofollow/nofollow/sponsored from the Link
      // prompt) instead of the base extension's blanket "every link gets
      // nofollow" default -- that default was silently applying to the
      // site's own internal cross-links, which should normally be
      // dofollow to pass link equity across the site.
      rel: {
        // noopener/noreferrer by default for every link (target="_blank"
        // always, so always guard reverse-tabnabbing); nofollow/sponsored
        // only when the author explicitly chooses it in the Link prompt.
        default: "noopener noreferrer",
        parseHTML: (element: HTMLElement) => element.getAttribute("rel"),
        renderHTML: (attributes: { rel?: string | null }) => (attributes.rel ? { rel: attributes.rel } : {}),
      },
    };
  },
});

// Same reasoning as Link's style attribute above, but for a destination
// URL on an image -- an image can't literally embed a video in any email
// client, so "click this thumbnail to watch on YouTube" is the real
// pattern, and it needs the <a href> to survive parse/edit/save just like
// everything else here does.
// The on-canvas delete control for an image node -- selecting an image and
// pressing Backspace already worked (TipTap images are atomic nodes), but
// nothing in the editor showed that, so existing posts' images looked
// stuck. This only replaces how the node renders inside the editor; saved
// HTML still comes from Image's renderHTML below, untouched.
function cssStringToObject(css: string): React.CSSProperties {
  const style: Record<string, string> = {};
  for (const rule of css.split(";")) {
    const [prop, value] = rule.split(":");
    if (!prop || !value) continue;
    const camel = prop.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    style[camel] = value.trim();
  }
  return style as React.CSSProperties;
}

function ImageNodeView({ node, deleteNode, extension, updateAttributes }: NodeViewProps) {
  // Mirrors whatever style Image.configure() was given for this editor
  // instance (blog vs. email), rather than a second hardcoded copy that
  // could drift from the one that actually gets saved.
  const configuredStyle = (extension.options?.HTMLAttributes?.style as string | undefined) || "width:100%;height:auto;";
  const [editingAlt, setEditingAlt] = useState(false);
  const [altDraft, setAltDraft] = useState(node.attrs.alt || "");
  const altInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingAlt) altInputRef.current?.focus();
  }, [editingAlt]);

  function saveAlt() {
    updateAttributes({ alt: altDraft.trim() });
    setEditingAlt(false);
  }

  return (
    <NodeViewWrapper className="group relative block overflow-hidden rounded-lg leading-[0]" data-drag-handle>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={node.attrs.src} alt={node.attrs.alt || ""} style={{ ...cssStringToObject(configuredStyle), display: "block", borderRadius: 0 }} />
      <div className="absolute right-2 top-2 hidden gap-1.5 group-hover:flex">
        <button
          type="button"
          aria-label="Edit alt text"
          title="Edit alt text"
          onClick={(event) => { event.preventDefault(); setAltDraft(node.attrs.alt || ""); setEditingAlt(true); }}
          className="flex h-8 items-center rounded-full bg-ink/70 px-3 text-xs font-medium text-white hover:bg-ink"
        >
          Alt text
        </button>
        <button
          type="button"
          aria-label="Delete image"
          title="Delete image"
          onClick={(event) => { event.preventDefault(); deleteNode(); }}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-ink/70 text-base leading-none text-white hover:bg-ink"
        >
          ×
        </button>
      </div>
      {editingAlt && (
        <div
          className="absolute inset-x-2 bottom-2 flex items-center gap-1.5 rounded-lg bg-white p-1.5 shadow-lg"
          onClick={(event) => event.stopPropagation()}
        >
          <input
            ref={altInputRef}
            value={altDraft}
            onChange={(event) => setAltDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") { event.preventDefault(); saveAlt(); }
              if (event.key === "Escape") { event.preventDefault(); setEditingAlt(false); }
            }}
            placeholder="Describe the image"
            maxLength={300}
            className="min-w-0 flex-1 rounded-md border border-line px-2 py-1.5 text-xs leading-normal text-ink outline-none focus:border-ink"
          />
          <button type="button" onClick={saveAlt} className="shrink-0 rounded-md bg-ink px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-85">Save</button>
        </div>
      )}
    </NodeViewWrapper>
  );
}

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
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
  renderHTML({ HTMLAttributes }) {
    const { href, ...imgAttrs } = HTMLAttributes;
    const img = ["img", { ...this.options.HTMLAttributes, ...imgAttrs }] as const;
    if (href) return ["a", { href, target: "_blank", rel: "noopener noreferrer" }, img];
    return img;
  },
});

// "noopener noreferrer" alone (no nofollow/sponsored) is the dofollow
// case -- every option keeps noopener/noreferrer since every link here
// opens target="_blank", and dropping those would reopen the
// reverse-tabnabbing hole regardless of crawl preference.
const REL_OPTIONS = [
  { value: "noopener noreferrer", label: "Normal (dofollow)" },
  { value: "noopener noreferrer nofollow", label: "Nofollow" },
  { value: "noopener noreferrer sponsored", label: "Sponsored" },
];

function LinkPrompt({ editor, onClose, showRelOptions }: { editor: Editor; onClose: () => void; showRelOptions: boolean }) {
  const wasActive = editor.isActive("link");
  const current = editor.getAttributes("link");
  const currentRel = typeof current.rel === "string" ? current.rel : "";
  const [url, setUrl] = useState((current.href as string) || "");
  const [rel, setRel] = useState(
    currentRel.includes("sponsored") ? REL_OPTIONS[2].value
      : currentRel.includes("nofollow") ? REL_OPTIONS[1].value
      : REL_OPTIONS[0].value
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function submit() {
    if (url.trim()) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim(), rel: showRelOptions ? rel : undefined }).run();
    }
    onClose();
  }

  function remove() {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 px-6" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-line bg-paper p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-medium">Link URL</p>
        <input
          ref={inputRef}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="https://..."
          className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
        />
        {showRelOptions && (
          <>
            <p className="mt-4 text-sm font-medium">Link type</p>
            <div className="mt-2 flex flex-col gap-1.5">
              {REL_OPTIONS.map((option) => (
                <label key={option.value} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="link-rel" checked={rel === option.value} onChange={() => setRel(option.value)} />
                  {option.label}
                </label>
              ))}
            </div>
          </>
        )}
        <div className="mt-5 flex items-center justify-between gap-2">
          {wasActive ? (
            <button type="button" onClick={remove} className="text-sm font-medium text-red-600 hover:underline">
              Remove link
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-line px-4 py-2 text-sm font-medium transition-colors hover:border-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90"
            >
              {wasActive ? "Update link" : "Add link"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The small popover Ghost/Medium show when you click into already-linked
 * text, instead of only ever exposing "add a link" from the toolbar.
 * Positioned from the clicked <a>'s own getBoundingClientRect(), which is
 * exact and needs no ProseMirror coordinate math. */
function LinkBubble({
  bubble,
  editor,
  showRelOptions,
  onClose,
}: {
  bubble: { pos: number; href: string; rel: string; rect: DOMRect };
  editor: Editor;
  showRelOptions: boolean;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(bubble.href);
  const [rel, setRel] = useState(
    bubble.rel.includes("sponsored") ? REL_OPTIONS[2].value
      : bubble.rel.includes("nofollow") ? REL_OPTIONS[1].value
      : REL_OPTIONS[0].value
  );
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as globalThis.Node)) onClose();
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [onClose]);

  function save() {
    if (!url.trim()) return;
    editor.chain().focus().setTextSelection(bubble.pos).extendMarkRange("link").setLink({ href: url.trim(), rel: showRelOptions ? rel : undefined }).run();
    onClose();
  }

  function remove() {
    editor.chain().focus().setTextSelection(bubble.pos).extendMarkRange("link").unsetLink().run();
    onClose();
  }

  const top = bubble.rect.bottom + 8;
  const left = Math.min(Math.max(bubble.rect.left, 12), window.innerWidth - 332);

  return (
    <div
      ref={boxRef}
      style={{ position: "fixed", top, left }}
      className="z-[90] w-[min(320px,calc(100vw-24px))] rounded-xl border border-line bg-white p-3 shadow-xl"
    >
      {editing ? (
        <div>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && save()}
            autoFocus
            placeholder="https://..."
            className="w-full rounded-md border border-line px-2.5 py-1.5 text-sm outline-none focus:border-ink"
          />
          {showRelOptions && (
            <div className="mt-2 flex flex-col gap-1">
              {REL_OPTIONS.map((option) => (
                <label key={option.value} className="flex items-center gap-2 text-xs">
                  <input type="radio" name="link-bubble-rel" checked={rel === option.value} onChange={() => setRel(option.value)} />
                  {option.label}
                </label>
              ))}
            </div>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-md px-2.5 py-1.5 text-xs font-medium text-ink-soft hover:bg-paper-soft">Cancel</button>
            <button type="button" onClick={save} className="rounded-md bg-ink px-2.5 py-1.5 text-xs font-medium text-white">Save</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <a href={bubble.href} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm text-ink underline">{bubble.href}</a>
          <button type="button" onClick={() => setEditing(true)} aria-label="Edit link" title="Edit link" className="shrink-0 rounded-md p-1.5 text-ink-soft hover:bg-paper-soft hover:text-ink">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
          </button>
          <button type="button" onClick={remove} aria-label="Remove link" title="Remove link" className="shrink-0 rounded-md p-1.5 text-ink-soft hover:bg-paper-soft hover:text-red-600">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M10 13.5a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.7 1.7M14 10.5a4.5 4.5 0 0 0-6.4 0l-3 3A4.5 4.5 0 0 0 11 20l1.7-1.7" strokeLinecap="round" strokeLinejoin="round" /><path d="m4 4 16 16" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}

function ButtonPrompt({ onSubmit, onClose }: { onSubmit: (text: string, url: string) => void; onClose: () => void }) {
  const [text, setText] = useState("Read more");
  const [url, setUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit() {
    if (text.trim() && url.trim()) onSubmit(text.trim(), url.trim());
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 px-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-line bg-paper p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-medium">Button</p>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Button text"
          className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <input
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
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim() || !url.trim()}
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Add button
          </button>
        </div>
      </div>
    </div>
  );
}

function ImagePrompt({ onSubmit, onClose }: { onSubmit: (href: string | null) => void; onClose: () => void }) {
  const [href, setHref] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit() {
    onSubmit(href.trim() || null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 px-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-line bg-paper p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-medium">Image</p>
        <p className="mt-1 text-xs text-ink-soft">
          Optional: make the image clickable, e.g. a video thumbnail that opens the real video on YouTube (email can&rsquo;t play video directly).
        </p>
        <input
          ref={inputRef}
          value={href}
          onChange={(e) => setHref(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Link to (leave blank for none)"
          className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-line px-4 py-2 text-sm font-medium transition-colors hover:border-ink">
            Cancel
          </button>
          <button type="button" onClick={submit} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90">
            Choose image...
          </button>
        </div>
      </div>
    </div>
  );
}

type PexelsPhoto = {
  id: number;
  alt: string;
  photographer: string;
  photographerUrl: string;
  photoUrl: string;
  thumbnail: string;
};

type InsertedBlogImage = {
  url: string;
  alt: string;
  photographer?: string;
  photographerUrl?: string;
  photoUrl?: string;
};

function BlogImagePicker({
  imageUploadUrl,
  onInsert,
  onClose,
}: {
  imageUploadUrl: string;
  onInsert: (image: InsertedBlogImage) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"upload" | "pexels" | "library">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [query, setQuery] = useState("");
  const [photos, setPhotos] = useState<PexelsPhoto[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<PexelsPhoto | null>(null);
  const [libraryItems, setLibraryItems] = useState<{ key: string; url: string }[]>([]);
  const [selectedLibraryUrl, setSelectedLibraryUrl] = useState<string | null>(null);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadLibrary() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/console/media?prefix=blog-images/").catch(() => null);
    const body = await response?.json().catch(() => ({})) ?? {};
    setLoading(false);
    setLibraryLoaded(true);
    if (!response?.ok) {
      setError(body.error || "Could not load the media library.");
      return;
    }
    setLibraryItems(body.items || []);
  }

  function insertFromLibrary() {
    if (!selectedLibraryUrl || !alt.trim()) {
      setError("Choose an image and describe what it shows.");
      return;
    }
    onInsert({ url: selectedLibraryUrl, alt: alt.trim() });
    onClose();
  }

  async function searchPexels() {
    if (query.trim().length < 2) {
      setError("Enter at least two letters to search.");
      return;
    }
    setLoading(true);
    setError("");
    setPhotos([]);
    setSelectedPhoto(null);
    const params = new URLSearchParams({ query: query.trim() });
    const response = await fetch(`/api/console/blog/pexels?${params}`).catch(() => null);
    const body = await response?.json().catch(() => ({})) ?? {};
    setLoading(false);
    if (!response?.ok) {
      setError(body.error || "Pexels search failed.");
      return;
    }
    setPhotos(body.photos as PexelsPhoto[]);
    if (!body.photos?.length) setError("No photos found. Try a different search.");
  }

  async function uploadLocalImage() {
    if (!file || !alt.trim()) {
      setError("Choose a photo and describe what it shows.");
      return;
    }
    setLoading(true);
    setError("");
    const data = new FormData();
    data.append("file", file);
    const response = await fetch(imageUploadUrl, { method: "POST", body: data }).catch(() => null);
    const body = await response?.json().catch(() => ({})) ?? {};
    setLoading(false);
    if (!response?.ok || !body.url) {
      setError(body.error || "Image upload failed.");
      return;
    }
    onInsert({ url: body.url as string, alt: alt.trim() });
    onClose();
  }

  async function importPexelsImage() {
    if (!selectedPhoto || !alt.trim()) {
      setError("Choose a photo and describe what it shows.");
      return;
    }
    setLoading(true);
    setError("");
    const response = await fetch("/api/console/blog/pexels/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoId: selectedPhoto.id }),
    }).catch(() => null);
    const body = await response?.json().catch(() => ({})) ?? {};
    setLoading(false);
    if (!response?.ok || !body.url) {
      setError(body.error || "Could not import that Pexels photo.");
      return;
    }
    onInsert({
      url: body.url as string,
      alt: alt.trim(),
      photographer: body.photographer as string,
      photographerUrl: body.photographerUrl as string,
      photoUrl: body.photoUrl as string,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/40 p-3 sm:p-6" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="blog-image-picker-title"
        className="flex max-h-[min(820px,94dvh)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 id="blog-image-picker-title" className="text-base font-semibold">Add image</h2>
            <p className="mt-1 text-xs text-ink-soft">Images are stored in your Cloudflare R2 bucket.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close image picker" className="flex h-9 w-9 items-center justify-center rounded-lg text-xl text-ink-soft hover:bg-paper-soft">×</button>
        </header>

        <div className="flex shrink-0 gap-1 border-b border-line px-4 pt-3">
          <button type="button" onClick={() => { setTab("upload"); setError(""); }} className={`rounded-t-lg px-4 py-2 text-sm font-medium ${tab === "upload" ? "border border-b-0 border-line bg-white text-ink" : "text-ink-soft hover:bg-paper-soft"}`}>Upload</button>
          <button type="button" onClick={() => { setTab("pexels"); setError(""); }} className={`rounded-t-lg px-4 py-2 text-sm font-medium ${tab === "pexels" ? "border border-b-0 border-line bg-white text-ink" : "text-ink-soft hover:bg-paper-soft"}`}>Pexels</button>
          <button type="button" onClick={() => { setTab("library"); setError(""); if (!libraryLoaded) void loadLibrary(); }} className={`rounded-t-lg px-4 py-2 text-sm font-medium ${tab === "library" ? "border border-b-0 border-line bg-white text-ink" : "text-ink-soft hover:bg-paper-soft"}`}>Library</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {tab === "upload" ? (
            <div className="mx-auto flex max-w-xl flex-col gap-4">
              <button type="button" onClick={() => fileRef.current?.click()} className="flex min-h-36 flex-col items-center justify-center rounded-xl border border-dashed border-line bg-paper-soft px-4 py-6 text-center hover:border-ink">
                <span className="text-sm font-medium">{file ? file.name : "Choose an image from your device"}</span>
                <span className="mt-1 text-xs text-ink-soft">PNG, JPEG, GIF, or WEBP · up to 5 MB</span>
              </button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(event) => { setFile(event.target.files?.[0] || null); setAlt(""); setError(""); }} />
              <label className="text-sm font-medium" htmlFor="blog-image-alt">Describe the image</label>
              <input id="blog-image-alt" value={alt} onChange={(event) => setAlt(event.target.value)} maxLength={300} placeholder="For example: A writer working at a desk by a window" className="-mt-3 w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-ink" />
              <button type="button" onClick={uploadLocalImage} disabled={loading || !file || !alt.trim()} className="rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{loading ? "Uploading to R2..." : "Upload and insert"}</button>
            </div>
          ) : tab === "library" ? (
            <div>
              {libraryItems.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {libraryItems.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => { setSelectedLibraryUrl(item.url); setAlt(""); setError(""); }}
                      className={`overflow-hidden rounded-lg border text-left ${selectedLibraryUrl === item.url ? "border-ink ring-1 ring-ink" : "border-line"}`}
                    >
                      {/* Arbitrary R2 keys, not a known-dimension local asset -- next/image needs a fixed size up front. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.url} alt={item.key} loading="lazy" className="h-28 w-full object-cover sm:h-32" />
                    </button>
                  ))}
                </div>
              )}
              {!loading && libraryLoaded && libraryItems.length === 0 && !error && (
                <p className="text-sm text-ink-soft">No images in your blog image library yet -- upload one to get started.</p>
              )}
              {selectedLibraryUrl && (
                <div className="mt-5 grid gap-3 rounded-xl border border-line bg-paper-soft p-4 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div>
                    <label className="block text-sm font-medium" htmlFor="library-image-alt">Describe the image</label>
                    <input id="library-image-alt" value={alt} onChange={(event) => setAlt(event.target.value)} maxLength={300} className="mt-2 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-ink" />
                  </div>
                  <button type="button" onClick={insertFromLibrary} disabled={!alt.trim()} className="rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Add to post</button>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="flex gap-2">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchPexels(); } }}
                  placeholder="Search free photos"
                  aria-label="Search Pexels photos"
                  className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-ink"
                />
                <button type="button" onClick={searchPexels} disabled={loading} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:border-ink disabled:opacity-50">Search</button>
              </div>
              {photos.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {photos.map((photo) => (
                    <div key={photo.id} className={`overflow-hidden rounded-lg border ${selectedPhoto?.id === photo.id ? "border-ink ring-1 ring-ink" : "border-line"}`}>
                      <button type="button" onClick={() => { setSelectedPhoto(photo); setAlt(photo.alt); setError(""); }} className="block w-full text-left">
                        {/* Remote thumbnails are direct Pexels previews; inserted originals are rehosted to R2. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo.thumbnail} alt={photo.alt || `Photo by ${photo.photographer} on Pexels`} loading="lazy" className="h-28 w-full object-cover sm:h-32" />
                      </button>
                      <div className="flex items-center justify-between gap-2 border-t border-line px-2 py-1.5 text-[11px]">
                        <a href={photo.photographerUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-ink-soft underline">Photo by {photo.photographer}</a>
                        <a href={photo.photoUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-ink-soft underline">Pexels</a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {selectedPhoto && (
                <div className="mt-5 grid gap-3 rounded-xl border border-line bg-paper-soft p-4 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div>
                    <label className="block text-sm font-medium" htmlFor="pexels-image-alt">Describe the image</label>
                    <input id="pexels-image-alt" value={alt} onChange={(event) => setAlt(event.target.value)} maxLength={300} className="mt-2 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-ink" />
                    <p className="mt-2 text-xs text-ink-soft">Credit will be added below the image.</p>
                  </div>
                  <button type="button" onClick={importPexelsImage} disabled={loading || !alt.trim()} className="rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{loading ? "Copying to R2..." : "Add to post"}</button>
                </div>
              )}
              <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex text-sm font-medium text-ink underline">Photos provided by Pexels</a>
            </div>
          )}
          {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
        </div>
      </section>
    </div>
  );
}

export default function RichTextEditor({
  value,
  onChange,
  variables,
  blogCanvas = false,
  canvasHeader,
  onDeletePost,
  imageUploadUrl = "/api/console/email/image-upload",
}: {
  value: string;
  onChange: (html: string) => void;
  variables?: { token: string; label: string }[];
  /** Blog-only canvas styling and provider paste cards. Email callers stay unchanged. */
  blogCanvas?: boolean;
  /** Feature image, title and excerpt -- rendered inside the same scroll
   * container as the body, above it, so the whole canvas scrolls as one
   * continuous page under a toolbar that stays put. Blog-only. */
  canvasHeader?: React.ReactNode;
  /** Adds "Delete post" to the toolbar's "More formatting" menu. Blog-only. */
  onDeletePost?: () => void;
  /** Defaults to the email content upload route so existing callers
   * (campaigns, automation, transactional templates) are unaffected. */
  imageUploadUrl?: string;
}) {
  const [promptOpen, setPromptOpen] = useState(false);
  const [buttonPromptOpen, setButtonPromptOpen] = useState(false);
  const [imagePromptOpen, setImagePromptOpen] = useState(false);
  const [blogImagePickerOpen, setBlogImagePickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [linkBubble, setLinkBubble] = useState<{ pos: number; href: string; rel: string; rect: DOMRect } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingImageHref = useRef<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Underline,
      TextStyle,
      Color,
      // Blog images always render at the full content width, not their own
      // natural pixel size -- otherwise a 560px diagram displays visibly
      // smaller than a 1200px screenshot next to it, in the editor and on
      // the published page alike (BlogPostArticle.tsx carries the matching
      // prose-img rule for the public page). Email composers keep the old
      // max-width behavior: a deliberately small inline logo shouldn't get
      // stretched to fill the email's content column.
      Image.configure({
        HTMLAttributes: {
          style: blogCanvas ? "width:100%;height:auto;border-radius:8px;" : "max-width:100%;height:auto;border-radius:8px;",
        },
      }),
      ...(blogCanvas ? [
        Youtube.configure({ addPasteHandler: true, width: "100%", height: 420, controls: true }),
        EmbedCard,
        Placeholder.configure({ placeholder: "Start writing your content..." }),
        SlashCommands.configure({ openImagePicker: () => setBlogImagePickerOpen(true) }),
        // Column resizing is off -- it relies on a data-colwidth attribute
        // that sanitizeBlogHtml.ts's allowlist would strip on save anyway
        // (only class/id/style survive on arbitrary tags), so a resizable
        // table would silently lose its widths on reload.
        Table.configure({ resizable: false }),
        TableRow,
        TableHeader,
        TableCell,
        TableOfContentsBlock,
      ] : []),
    ],
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: blogCanvas
          ? "blog-writing-canvas prose prose-lg mx-auto min-h-full w-full max-w-none px-6 py-7 focus:outline-none sm:px-12 sm:py-9 xl:px-16 [&_iframe]:max-w-full [&_[data-youtube-video]]:my-8 [&_.node-image+p]:text-center [&_.node-image+p]:text-sm [&_.node-image+p]:italic [&_.node-image+p]:text-ink-soft [&_table]:[table-layout:fixed] [&_table]:w-full [&_table]:border-collapse [&_td]:min-w-[80px] [&_td]:min-h-[2.5rem] [&_th]:min-w-[80px] [&_td]:border [&_td]:border-line [&_th]:border [&_th]:border-line [&_td]:p-2 [&_th]:p-2 [&_th]:bg-paper-soft [&_.selectedCell]:bg-paper-soft"
          : "prose prose-sm max-w-none min-h-[200px] px-4 py-3 focus:outline-none",
      },
      // Belt-and-suspenders on top of Link's own openOnClick:false -- a
      // link whose href is a literal unresolved placeholder like
      // "{{course_url}}" (real content in this editor, since template
      // vars only get resolved at send time) is not a real URL, and any
      // click on it while editing must never navigate the console away.
      handleClickOn: () => true,
      handleDOMEvents: {
        click: (view, event) => {
          const target = event.target as HTMLElement;
          const anchor = target.closest("a");
          if (anchor) {
            event.preventDefault();
            if (blogCanvas) {
              const pos = view.posAtDOM(anchor, 0);
              setLinkBubble({
                pos,
                href: anchor.getAttribute("href") || "",
                rel: anchor.getAttribute("rel") || "",
                rect: anchor.getBoundingClientRect(),
              });
            }
            return true;
          }
          setLinkBubble(null);
          return false;
        },
      },
    },
  });

  // Keep the editor in sync when a parent loads/replaces a saved template.
  // Tiptap treats `content` as initialization only; without this controlled
  // value sync, the subject updates while the already-mounted message editor
  // keeps its old (often empty) document.
  useEffect(() => {
    if (!editor || editor.isDestroyed || editor.getHTML() === value) return;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return null;

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const href = pendingImageHref.current;
    pendingImageHref.current = null;
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(imageUploadUrl, { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    setUploading(false);
    if (res.ok && body.url) {
      editor
        ?.chain()
        .focus()
        .insertContent({ type: "image", attrs: { src: body.url, href } })
        .run();
    }
  }

  function btnClass(active: boolean) {
    return `rounded-md px-2.5 py-1.5 text-sm font-medium ${
      active ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-soft"
    }`;
  }

  return (
    <div className={blogCanvas ? "flex min-h-0 flex-1 flex-col overflow-hidden bg-white" : "overflow-hidden rounded-xl border border-line"}>
      {blogCanvas ? (
        <BlogToolbar
          editor={editor}
          onLink={() => { setLinkBubble(null); setPromptOpen(true); }}
          onImage={() => setBlogImagePickerOpen(true)}
          onButton={() => setButtonPromptOpen(true)}
          onDeletePost={onDeletePost}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-1 border-b border-line bg-paper-soft p-2">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={btnClass(editor.isActive("bold"))}
        >
          Bold
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={btnClass(editor.isActive("italic"))}
        >
          Italic
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={btnClass(editor.isActive("underline"))}
        >
          Underline
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={btnClass(editor.isActive("bulletList"))}
        >
          Bullet list
        </button>
        <button
          type="button"
          onClick={() => setPromptOpen(true)}
          className={btnClass(editor.isActive("link"))}
        >
          Link
        </button>
        <button type="button" onClick={() => setButtonPromptOpen(true)} className={btnClass(false)}>
          Button
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={btnClass(editor.isActive("blockquote"))}
        >
          Quote
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={btnClass(editor.isActive("codeBlock"))}
        >
          Code
        </button>
        <button
          type="button"
          onClick={() => setImagePromptOpen(true)}
          disabled={uploading}
          className={`${btnClass(false)} disabled:opacity-50`}
        >
          {uploading ? "Uploading..." : "Image"}
        </button>
        {variables && variables.length > 0 && (
          <div className="ml-1 flex items-center gap-1.5 text-xs text-ink-soft">
            Insert field
            <div className="w-36">
              <BrandSelect
                value=""
                placeholder="Choose…"
                compact
                onChange={(token) => {
                  if (token) editor.chain().focus().insertContent(`{{${token}}}`).run();
                }}
                options={variables.map((variable) => ({ value: variable.token, label: variable.label }))}
              />
            </div>
          </div>
        )}
        <div className="mx-1 h-5 w-px bg-line" />
        {([1, 2, 3] as const).map((level) => (
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
        {BRAND_COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => editor.chain().focus().setColor(c.value).run()}
            title={c.label}
            className={`h-7 w-7 rounded-full border-2 transition-transform ${
              editor.isActive("textStyle", { color: c.value }) ? "scale-110 border-ink" : "border-line"
            }`}
            style={{ backgroundColor: c.value }}
          />
        ))}
        <button
          type="button"
          onClick={() => editor.chain().focus().unsetColor().run()}
          className="rounded-md px-2 py-1.5 text-xs font-medium text-ink-soft hover:bg-paper-soft"
        >
          Reset color
        </button>
        </div>
      )}
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImagePick} className="hidden" />
      <div className={blogCanvas ? "min-h-0 flex-1 overflow-y-auto overscroll-contain" : undefined}>
        {blogCanvas && canvasHeader}
        <EditorContent editor={editor} />
      </div>
      {promptOpen && (
        <LinkPrompt editor={editor} showRelOptions={blogCanvas} onClose={() => setPromptOpen(false)} />
      )}
      {linkBubble && (
        <LinkBubble bubble={linkBubble} editor={editor} showRelOptions={blogCanvas} onClose={() => setLinkBubble(null)} />
      )}
      {buttonPromptOpen && (
        <ButtonPrompt
          onSubmit={(text, url) =>
            editor
              .chain()
              .focus()
              .insertContent({
                type: "paragraph",
                content: [{ type: "text", text, marks: [{ type: "link", attrs: { href: url, style: BUTTON_STYLE } }] }],
              })
              .run()
          }
          onClose={() => setButtonPromptOpen(false)}
        />
      )}
      {imagePromptOpen && (
        <ImagePrompt
          onSubmit={(href) => {
            pendingImageHref.current = href;
            fileInputRef.current?.click();
          }}
          onClose={() => setImagePromptOpen(false)}
        />
      )}
      {blogImagePickerOpen && (
        <BlogImagePicker
          imageUploadUrl={imageUploadUrl}
          onClose={() => setBlogImagePickerOpen(false)}
          onInsert={(image) => {
            const content = [
              { type: "image", attrs: { src: image.url, alt: image.alt } },
              ...(image.photographer && image.photographerUrl && image.photoUrl ? [{
                type: "paragraph",
                content: [
                  { type: "text", text: "Photo by " },
                  { type: "text", text: image.photographer, marks: [{ type: "link", attrs: { href: image.photographerUrl } }] },
                  { type: "text", text: " on " },
                  { type: "text", text: "Pexels", marks: [{ type: "link", attrs: { href: image.photoUrl } }] },
                ],
              }] : []),
            ];
            editor.chain().focus().insertContent(content).run();
          }}
        />
      )}
    </div>
  );
}
