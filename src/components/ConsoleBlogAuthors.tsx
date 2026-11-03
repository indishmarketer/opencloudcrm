"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useConfirm } from "@/components/ConfirmDialog";
import BrandSelect from "@/components/BrandSelect";
import { SOCIAL_PLATFORMS } from "@/components/SocialIcon";

type SocialLink = { label: string; url: string };

type BlogAuthor = {
  id: number;
  slug: string;
  name: string;
  role: string | null;
  bio: string | null;
  avatar_url: string | null;
  social_links: SocialLink[];
  is_active: boolean;
};

const emptyForm = {
  name: "",
  role: "",
  bio: "",
  avatar_url: "" as string | null,
  social_links: [] as SocialLink[],
  is_active: true,
};

export default function ConsoleBlogAuthors() {
  const [authors, setAuthors] = useState<BlogAuthor[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const { confirm, dialog } = useConfirm();
  const mountedRef = useRef(true);

  async function load() {
    const res = await fetch("/api/console/blog-authors");
    const body = await res.json();
    if (!mountedRef.current) return;
    setAuthors(body.authors || []);
  }

  useEffect(() => {
    load();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  function startEdit(a: BlogAuthor) {
    setEditingId(a.id);
    setForm({
      name: a.name,
      role: a.role || "",
      bio: a.bio || "",
      avatar_url: a.avatar_url,
      social_links: a.social_links || [],
      is_active: a.is_active,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleAvatarUpload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError("");
    const body = new FormData();
    body.set("file", file);
    try {
      const res = await fetch("/api/console/blog-authors/avatar-upload", { method: "POST", body });
      const response = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(response.error || "Could not upload the image.");
      setForm((f) => ({ ...f, avatar_url: response.url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the image.");
    } finally {
      setUploading(false);
    }
  }

  function updateSocialLink(index: number, field: "label" | "url", value: string) {
    setForm((f) => ({
      ...f,
      social_links: f.social_links.map((l, i) => (i === index ? { ...l, [field]: value } : l)),
    }));
  }

  function addSocialLink() {
    setForm((f) => ({ ...f, social_links: [...f.social_links, { label: "Website", url: "" }] }));
  }

  function removeSocialLink(index: number) {
    setForm((f) => ({ ...f, social_links: f.social_links.filter((_, i) => i !== index) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const res = await fetch(editingId ? `/api/console/blog-authors/${editingId}` : "/api/console/blog-authors", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error || "Something went wrong.");
    } else {
      resetForm();
      load();
    }
    setSaving(false);
  }

  async function handleDelete(a: BlogAuthor) {
    const ok = await confirm({ message: `Delete the author profile "${a.name}"? This can't be undone.` });
    if (!ok) return;
    await fetch(`/api/console/blog-authors/${a.id}`, { method: "DELETE" });
    if (editingId === a.id) resetForm();
    load();
  }

  return (
    <div>
      <p className="mb-4 text-sm text-ink-soft">
        Real profiles for every blog byline, including the one that&apos;s always existed (yours) and any guest
        author once their draft is accepted on the Author apps tab. Publishing a post with one of these bylines is
        still manual (the blog itself is static JSON files, not database-driven) — this is where the profile
        itself lives and gets edited.
      </p>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-line p-6">
        <p className="font-display text-lg font-semibold">{editingId ? "Edit author" : "Add an author"}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink sm:col-span-2"
          />
          <input
            placeholder="Role (e.g. Guest contributor)"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink sm:col-span-2"
          />

          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-ink-soft">Avatar</label>
            <div className="flex items-center gap-4">
              {form.avatar_url ? (
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-line">
                  <Image src={form.avatar_url} alt="Avatar preview" fill className="object-cover" />
                </div>
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-line bg-paper-soft text-xs text-ink-soft">
                  None
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <label className="cursor-pointer rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink">
                  {uploading ? "Uploading…" : "Upload image"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    disabled={uploading}
                    onChange={(e) => handleAvatarUpload(e.target.files?.[0])}
                    className="sr-only"
                  />
                </label>
                {form.avatar_url && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, avatar_url: null }))}
                    className="text-sm text-red-600 underline hover:text-red-700"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          <textarea
            placeholder="Bio"
            value={form.bio}
            onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
            rows={3}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink sm:col-span-2"
          />

          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-ink-soft">Website and social links</label>
            <div className="space-y-2">
              {form.social_links.map((link, i) => (
                <div key={i} className="flex gap-2">
                  <div className="w-36 shrink-0">
                    <BrandSelect
                      value={link.label}
                      onChange={(v) => updateSocialLink(i, "label", v)}
                      options={[
                        ...(link.label && !(SOCIAL_PLATFORMS as readonly string[]).includes(link.label) ? [link.label] : []),
                        ...SOCIAL_PLATFORMS,
                      ].map((p) => ({ value: p, label: p }))}
                      compact
                    />
                  </div>
                  <input
                    placeholder="https://…"
                    value={link.url}
                    onChange={(e) => updateSocialLink(i, "url", e.target.value)}
                    className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
                  />
                  <button
                    type="button"
                    onClick={() => removeSocialLink(i)}
                    className="shrink-0 text-sm text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addSocialLink}
              className="mt-2 text-xs font-medium text-ink-soft underline hover:text-ink"
            >
              + Add a link
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              className="h-4 w-4 rounded border-line"
            />
            Active (shows on the site)
          </label>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {saving ? "Saving..." : editingId ? "Save changes" : "Add author"}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="text-sm text-ink-soft hover:text-ink">
              Cancel
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </form>

      <div className="mt-8 space-y-2">
        {authors.length === 0 && <p className="text-sm text-ink-soft">No author profiles yet.</p>}
        {authors.map((a) => (
          <div key={a.id} className="flex items-center gap-3 rounded-xl border border-line bg-paper p-3">
            {a.avatar_url ? (
              <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full">
                <Image src={a.avatar_url} alt={a.name} fill className="object-cover" />
              </div>
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper-soft text-xs text-ink-soft">
                {a.name.slice(0, 1)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {a.name} <span className="text-xs font-normal text-ink-soft">/{a.slug}</span>
              </p>
              {a.role && <p className="truncate text-xs text-ink-soft">{a.role}</p>}
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                a.is_active ? "bg-green-100 text-green-700" : "bg-paper-soft text-ink-soft"
              }`}
            >
              {a.is_active ? "Active" : "Inactive"}
            </span>
            <button onClick={() => startEdit(a)} className="shrink-0 text-xs font-medium text-ink hover:underline">
              Edit
            </button>
            <button onClick={() => handleDelete(a)} className="shrink-0 text-xs font-medium text-red-600 hover:underline">
              Delete
            </button>
          </div>
        ))}
      </div>
      {dialog}
    </div>
  );
}
