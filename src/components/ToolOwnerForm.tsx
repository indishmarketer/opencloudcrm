"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import BrandSelect from "@/components/BrandSelect";
import { PRICING_OPTIONS } from "@/lib/directoryFields";

const MAX_SCREENSHOTS = 4;

type Category = { id: number; name: string };

export type OwnerTool = {
  id: number;
  name: string;
  tagline: string | null;
  description: string | null;
  category_id: number;
  pricing_type: string;
  website_url: string;
  screenshots: string[];
  status: string;
};

/** The submitter's own form for a tool. When we asked for changes it
 * resubmits the tool for review; on a live tool it sends an edit request
 * that an admin approves before anything changes on the site. */
export default function ToolOwnerForm({ tool, categories }: { tool: OwnerTool; categories: Category[] }) {
  const router = useRouter();
  const isLive = tool.status === "published";
  const [name, setName] = useState(tool.name);
  const [websiteUrl, setWebsiteUrl] = useState(tool.website_url);
  const [tagline, setTagline] = useState(tool.tagline || "");
  const [description, setDescription] = useState(tool.description || "");
  const [categoryId, setCategoryId] = useState(String(tool.category_id));
  const [pricingType, setPricingType] = useState(tool.pricing_type);
  const [screenshots, setScreenshots] = useState<string[]>(tool.screenshots || []);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/directory/screenshot-upload", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Upload failed.");
      setScreenshots((prev) => [...prev, body.url]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/directory/my-tools/${tool.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          website_url: websiteUrl,
          tagline,
          description,
          category_id: categoryId,
          pricing_type: pricingType,
          screenshots,
          message,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save your changes.");
      router.push(`/account/tools?sent=${isLive ? "edit" : "resubmitted"}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your changes.");
      setSaving(false);
    }
  }

  const input = "mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink";

  return (
    <form onSubmit={save} className="space-y-5 rounded-2xl border border-line p-8">
      <div>
        <label className="text-sm font-medium" htmlFor="name">Tool name</label>
        <input id="name" required value={name} onChange={(e) => setName(e.target.value)} className={input} />
      </div>
      <div>
        <label className="text-sm font-medium" htmlFor="website_url">Website or GitHub link</label>
        <input id="website_url" type="url" required value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} className={input} />
      </div>
      <div>
        <label className="text-sm font-medium" htmlFor="tagline">Tagline (one line)</label>
        <input id="tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} className={input} />
      </div>
      <div>
        <label className="text-sm font-medium" htmlFor="description">Description</label>
        <textarea id="description" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} className={input} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-sm font-medium">Category</p>
          <div className="mt-2">
            <BrandSelect value={categoryId} onChange={setCategoryId} options={categories.map((c) => ({ value: String(c.id), label: c.name }))} />
          </div>
        </div>
        <div>
          <p className="text-sm font-medium">Pricing</p>
          <div className="mt-2">
            <BrandSelect value={pricingType} onChange={setPricingType} options={PRICING_OPTIONS} />
          </div>
        </div>
      </div>
      <div>
        <p className="text-sm font-medium">Screenshots (up to {MAX_SCREENSHOTS})</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {screenshots.map((s, i) => (
            <div key={s} className="relative">
              <Image src={s} alt={`${name || "Tool"} screenshot ${i + 1}`} width={64} height={64} className="h-16 w-16 rounded-md border border-line object-cover" />
              <button
                type="button"
                aria-label={`Remove screenshot ${i + 1}`}
                onClick={() => setScreenshots((arr) => arr.filter((_, idx) => idx !== i))}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-xs text-paper"
              >
                ×
              </button>
            </div>
          ))}
          {screenshots.length < MAX_SCREENSHOTS && (
            <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-md border border-dashed border-line text-xs text-ink-soft hover:border-ink">
              {uploading ? "..." : "+"}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={upload} disabled={uploading} />
            </label>
          )}
        </div>
      </div>
      {isLive && (
        <div>
          <label className="text-sm font-medium" htmlFor="message">What changed and why? (optional)</label>
          <textarea
            id="message"
            rows={2}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="For example: we launched a free plan, so the pricing changed."
            className={input}
          />
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={saving || uploading}
        className="w-full rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {saving ? "Sending..." : isLive ? "Send edit request" : "Send back for review"}
      </button>
      <p className="text-center text-xs text-ink-soft">
        {isLive
          ? "Your listing stays as it is until we approve the edit. We'll email you either way."
          : "We'll review it again and email you."}
      </p>
    </form>
  );
}
