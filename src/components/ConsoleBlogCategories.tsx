"use client";

import { useMemo, useRef, useState } from "react";
import MediaLibraryPicker from "@/components/MediaLibraryPicker";
import ConsoleModal from "@/components/ConsoleModal";
import { useConfirm } from "@/components/ConfirmDialog";
import type { BlogCategory } from "@/lib/blogCategories";

const blank = { id: null as number | null, slug: "", name: "", description: "", image: "", image_alt: "", position: 0 };
const field = "w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink";
const PAGE_SIZE = 10;

export default function ConsoleBlogCategories({ initial }: { initial: BlogCategory[] }) {
  const [categories, setCategories] = useState(initial);
  const [form, setForm] = useState(blank);
  const [modalOpen, setModalOpen] = useState(false);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);
  const { confirm, dialog } = useConfirm();
  const pageCount = Math.max(1, Math.ceil(categories.length / PAGE_SIZE));
  const visible = useMemo(() => categories.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [categories, page]);

  function closeModal() {
    if (busy) return;
    setModalOpen(false);
    setForm(blank);
    setError("");
  }
  function add() {
    setForm({ ...blank, position: categories.length });
    setError("");
    setModalOpen(true);
  }
  function edit(category: BlogCategory) {
    setForm({ ...category });
    setError("");
    setModalOpen(true);
  }
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true); setError("");
    const data = new FormData(); data.set("file", file);
    try {
      const response = await fetch("/api/console/blog/image-upload", { method: "POST", body: data });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Image upload failed.");
      setForm((current) => ({ ...current, image: body.url }));
    } catch (e) { setError(e instanceof Error ? e.message : "Image upload failed."); }
    finally { setBusy(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(form.id ? `/api/console/blog-categories/${form.id}` : "/api/console/blog-categories", {
        method: form.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not save category.");
      setCategories((current) => form.id ? current.map((item) => item.id === form.id ? body.category : item) : [...current, body.category]);
      setPage(form.id ? page : Math.ceil((categories.length + 1) / PAGE_SIZE));
      setModalOpen(false);
      setForm(blank);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save category."); }
    finally { setBusy(false); }
  }
  async function remove(category: BlogCategory) {
    const ok = await confirm({ message: `Delete “${category.name}”? Categories with posts must be reassigned first.`, confirmLabel: "Delete" });
    if (!ok) return;
    const response = await fetch(`/api/console/blog-categories/${category.id}`, { method: "DELETE" });
    const body = await response.json();
    if (!response.ok) { setError(body.error || "Could not delete category."); return; }
    const nextCount = categories.length - 1;
    setCategories((current) => current.filter((item) => item.id !== category.id));
    setPage((current) => Math.min(current, Math.max(1, Math.ceil(nextCount / PAGE_SIZE))));
    if (form.id === category.id) closeModal();
  }

  return <div className="space-y-5">
    {dialog}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-display text-xl font-semibold">Categories</h2><p className="mt-1 text-sm text-ink-soft">{categories.length} {categories.length === 1 ? "category" : "categories"}</p></div>
      <button type="button" onClick={add} className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper">Add category</button>
    </div>

    {error && !modalOpen && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {categories.length === 0 ? <p className="rounded-xl border border-line p-6 text-sm text-ink-soft">No blog categories yet. Add a category to get started.</p> : (
      <>
        <section className="space-y-3" aria-label="Blog categories">
          {visible.map((category) => <article key={category.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-paper p-4">
            {category.image && <img src={category.image} alt={category.image_alt || category.name} className="h-16 w-24 rounded-lg object-cover" />}
            <div className="min-w-0 flex-1"><h3 className="font-medium">{category.name}</h3><p className="text-xs text-ink-soft">/blog/category/{category.slug}</p><p className="mt-1 line-clamp-2 text-sm text-ink-soft">{category.description}</p></div>
            <button type="button" onClick={() => edit(category)} className="rounded-full border border-line px-4 py-2 text-sm">Edit</button><button type="button" onClick={() => void remove(category)} className="rounded-full border border-red-200 px-4 py-2 text-sm text-red-700">Delete</button>
          </article>)}
        </section>
        {pageCount > 1 && <nav className="flex items-center justify-center gap-3 pt-2" aria-label="Category pages">
          <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-40">Previous</button>
          <span className="text-sm text-ink-soft">Page {page} of {pageCount}</span>
          <button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page === pageCount} className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-40">Next</button>
        </nav>}
      </>
    )}

    {modalOpen && <ConsoleModal title={form.id ? "Edit category" : "Add category"} onClose={closeModal} wide closeOnEscape={false}>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium">Category title<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} /></label>
          <label className="grid gap-1.5 text-sm font-medium">URL slug<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="ai-automation" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className={field} /><span className="text-xs text-ink-soft">Public URL: /blog/category/{form.slug || "category-name"}</span></label>
        </div>
        <label className="grid gap-1.5 text-sm font-medium">Short description<textarea rows={3} maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={field} /></label>
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
          <label className="grid gap-1.5 text-sm font-medium">Featured image URL<input value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} className={field} /></label>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="rounded-full border border-line px-4 py-2.5 text-sm font-medium hover:border-ink">Upload image</button>
          <button type="button" onClick={() => setPicker(true)} className="rounded-full border border-line px-4 py-2.5 text-sm font-medium hover:border-ink">Choose from media</button>
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
        {form.image && <img src={form.image} alt="Category featured image preview" className="max-h-56 rounded-xl border border-line object-contain" />}
        <label className="grid gap-1.5 text-sm font-medium">Image alt text<input value={form.image_alt} onChange={(e) => setForm({ ...form, image_alt: e.target.value })} maxLength={300} className={field} /></label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button disabled={busy} className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper disabled:opacity-50">{busy ? "Saving…" : form.id ? "Save category" : "Create category"}</button>
      </form>
    </ConsoleModal>}
    {picker && <MediaLibraryPicker onSelect={(url) => { setForm((current) => ({ ...current, image: url })); setPicker(false); }} onClose={() => setPicker(false)} />}
  </div>;
}
