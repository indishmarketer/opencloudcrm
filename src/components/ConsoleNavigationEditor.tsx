"use client";

import { useState } from "react";
import BrandSelect from "@/components/BrandSelect";
import {
  SOCIAL_PLATFORMS,
  type ChromeLink,
  type FooterColumn,
  type HeaderItem,
  type SiteChrome,
  type SocialPlatform,
} from "@/lib/siteChromeShape";

const button =
  "rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink disabled:opacity-40";
const primaryButton =
  "rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:cursor-wait disabled:opacity-60";
const inputClass =
  "w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none transition focus:border-ink";

const SOCIAL_LABELS: Record<SocialPlatform, string> = {
  facebook: "Facebook",
  x: "X (Twitter)",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  tiktok: "TikTok",
  github: "GitHub",
};

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function OrderButtons({ index, length, onMove, onRemove }: { index: number; length: number; onMove: (to: number) => void; onRemove: () => void }) {
  return (
    <div className="flex shrink-0 gap-1">
      <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => onMove(index - 1)} className={button}>↑</button>
      <button type="button" aria-label="Move down" disabled={index === length - 1} onClick={() => onMove(index + 1)} className={button}>↓</button>
      <button type="button" aria-label="Remove" onClick={onRemove} className={button}>✕</button>
    </div>
  );
}

function LinksEditor({ links, onChange, withDescription, linkOptions }: { links: ChromeLink[]; onChange: (l: ChromeLink[]) => void; withDescription: boolean; linkOptions: string[] }) {
  return (
    <div className="space-y-2">
      {links.map((l, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-xl border border-line bg-paper p-2 sm:flex-row sm:items-start">
          <input value={l.label} placeholder="Label" onChange={(e) => onChange(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className={inputClass} />
          <input value={l.href} list="nav-link-options" placeholder="/page" onChange={(e) => onChange(links.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)))} className={inputClass} />
          {withDescription && (
            <input value={l.description} placeholder="Short description (optional)" onChange={(e) => onChange(links.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} className={inputClass} />
          )}
          <OrderButtons index={i} length={links.length} onMove={(to) => onChange(move(links, i, to))} onRemove={() => onChange(links.filter((_, j) => j !== i))} />
        </div>
      ))}
      <button type="button" onClick={() => onChange([...links, { label: "", href: "", description: "" }])} className={button}>
        + Add link
      </button>
      <datalist id="nav-link-options">
        {linkOptions.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </div>
  );
}

/** Header menu, header button, footer columns and social links. */
export default function ConsoleNavigationEditor({ initial, linkOptions }: { initial: SiteChrome; linkOptions: string[] }) {
  const [chrome, setChrome] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"header" | "footer" | "socials">("header");

  const setItems = (items: HeaderItem[]) => setChrome((c) => ({ ...c, header: { ...c.header, items } }));
  const setColumns = (columns: FooterColumn[]) => setChrome((c) => ({ ...c, footer: { ...c.footer, columns } }));

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/v1/site/navigation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chrome),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save.");
      setChrome(data.chrome);
      setMessage("Saved. Live on every page within a few seconds.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <nav aria-label="Menu and footer settings" className="flex gap-2 border-b border-line pb-3">
        {([ ["header", "Header menu"], ["footer", "Footer"], ["socials", "Social links"] ] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setActiveTab(key)} aria-current={activeTab === key ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm font-medium ${activeTab === key ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-soft hover:text-ink"}`}>{label}</button>
        ))}
      </nav>
      {activeTab === "header" && <section className="rounded-2xl border border-line bg-paper-soft p-6">
        <h2 className="text-lg font-semibold text-ink">Header menu</h2>
        <p className="mt-1 text-sm text-ink-soft">
          A <strong>dropdown</strong> opens grouped links; a <strong>link</strong> goes straight to a page.
        </p>
        <div className="mt-5 space-y-3">
          {chrome.header.items.map((item, i) => (
            <div key={i} className="rounded-xl border border-line bg-paper p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="sm:w-44">
                  <BrandSelect
                    value={item.type}
                    onChange={(v) => {
                      const type = v as HeaderItem["type"];
                      const next: HeaderItem =
                        type === "dropdown" ? { type, label: item.label, columns: item.type === "dropdown" ? item.columns : [{ title: "", links: [] }] }
                          : type === "link" ? { type, label: item.label, href: item.type === "link" ? item.href : "" }
                            : { type, label: item.label };
                      setItems(chrome.header.items.map((x, j) => (j === i ? next : x)));
                    }}
                    options={[
                      { value: "dropdown", label: "Dropdown" },
                      { value: "link", label: "Link" },
                    ]}
                  />
                </div>
                <input value={item.label} placeholder="Label" onChange={(e) => setItems(chrome.header.items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className={inputClass} />
                {item.type === "link" && (
                  <input value={item.href} list="nav-link-options" placeholder="/page" onChange={(e) => setItems(chrome.header.items.map((x, j) => (j === i ? { ...item, href: e.target.value } : x)))} className={inputClass} />
                )}
                <OrderButtons index={i} length={chrome.header.items.length} onMove={(to) => setItems(move(chrome.header.items, i, to))} onRemove={() => setItems(chrome.header.items.filter((_, j) => j !== i))} />
              </div>
              {item.type === "dropdown" && <div className="mt-3 space-y-3 border-l border-line pl-3">
                {item.columns.map((column, columnIndex) => <div key={columnIndex} className="rounded-lg border border-line p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <input value={column.title} placeholder={`Column ${columnIndex + 1} heading (optional)`} onChange={(e) => setItems(chrome.header.items.map((x, j) => j === i && x.type === "dropdown" ? { ...x, columns: x.columns.map((c, k) => k === columnIndex ? { ...c, title: e.target.value } : c) } : x))} className={inputClass} />
                    <button type="button" disabled={item.columns.length <= 1} onClick={() => setItems(chrome.header.items.map((x, j) => j === i && x.type === "dropdown" ? { ...x, columns: x.columns.filter((_, k) => k !== columnIndex) } : x))} className={button}>Remove column</button>
                  </div>
                  <LinksEditor links={column.links} withDescription linkOptions={linkOptions} onChange={(links) => setItems(chrome.header.items.map((x, j) => j === i && x.type === "dropdown" ? { ...x, columns: x.columns.map((c, k) => k === columnIndex ? { ...c, links } : c) } : x))} />
                </div>)}
                <button type="button" disabled={item.columns.length >= 5} onClick={() => setItems(chrome.header.items.map((x, j) => j === i && x.type === "dropdown" ? { ...x, columns: [...x.columns, { title: "", links: [] }] } : x))} className={button}>+ Add column {item.columns.length >= 5 ? "(maximum 5)" : ""}</button>
              </div>}
            </div>
          ))}
          <button type="button" onClick={() => setItems([...chrome.header.items, { type: "link", label: "", href: "" }])} className={button}>
            + Add menu item
          </button>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium">
            Header button text (blank hides it)
            <input value={chrome.header.ctaLabel} onChange={(e) => setChrome({ ...chrome, header: { ...chrome.header, ctaLabel: e.target.value } })} className={inputClass} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Header button link
            <input value={chrome.header.ctaHref} list="nav-link-options" onChange={(e) => setChrome({ ...chrome, header: { ...chrome.header, ctaHref: e.target.value } })} className={inputClass} />
          </label>
        </div>
      </section>}

      {activeTab === "footer" && <section className="rounded-2xl border border-line bg-paper-soft p-6">
        <h2 className="text-lg font-semibold text-ink">Footer</h2>
        <label className="mt-4 grid gap-1.5 text-sm font-medium">
          Tagline under your site name
          <textarea rows={2} maxLength={300} value={chrome.footer.tagline} onChange={(e) => setChrome({ ...chrome, footer: { ...chrome.footer, tagline: e.target.value } })} className={inputClass} />
        </label>
        <div className="mt-5 space-y-3">
          {chrome.footer.columns.map((col, i) => (
            <div key={i} className="rounded-xl border border-line bg-paper p-3">
              <div className="flex items-center gap-2">
                <input value={col.title} placeholder="Column title" onChange={(e) => setColumns(chrome.footer.columns.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} className={inputClass} />
                <OrderButtons index={i} length={chrome.footer.columns.length} onMove={(to) => setColumns(move(chrome.footer.columns, i, to))} onRemove={() => setColumns(chrome.footer.columns.filter((_, j) => j !== i))} />
              </div>
              <div className="mt-3 border-l border-line pl-3">
                <LinksEditor links={col.links} withDescription={false} linkOptions={linkOptions} onChange={(links) => setColumns(chrome.footer.columns.map((x, j) => (j === i ? { ...x, links } : x)))} />
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setColumns([...chrome.footer.columns, { title: "", links: [] }])} className={button}>
            + Add column
          </button>
        </div>
        <p className="mt-5 text-sm text-ink-soft">
          The address, email, phone and legal line at the bottom come from Site settings &rarr; Business details.
        </p>
      </section>}

      {activeTab === "socials" && <section className="rounded-2xl border border-line bg-paper-soft p-6">
        <h2 className="text-lg font-semibold text-ink">Social links</h2>
        <p className="mt-1 text-sm text-ink-soft">Shown in the footer and given to search engines. Leave blank to hide.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {SOCIAL_PLATFORMS.map((platform) => (
            <label key={platform} className="grid gap-1.5 text-sm font-medium">
              {SOCIAL_LABELS[platform]}
              <input
                value={chrome.socials[platform] || ""}
                placeholder="https://"
                onChange={(e) => setChrome({ ...chrome, socials: { ...chrome.socials, [platform]: e.target.value } })}
                className={inputClass}
              />
            </label>
          ))}
        </div>
      </section>}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-4">
        <button type="button" onClick={save} disabled={saving} className={primaryButton}>
          {saving ? "Saving…" : "Save menu & footer"}
        </button>
        {message && <p className="text-sm text-ink-soft">{message}</p>}
      </div>
    </div>
  );
}
