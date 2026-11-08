"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SafeImage from "@/components/SafeImage";
import { useRouter } from "next/navigation";
import BrandSelect from "@/components/BrandSelect";
import RichTextEditor from "@/components/RichTextEditor";
import { useConfirm } from "@/components/ConfirmDialog";
import { resolveImage } from "@/lib/images";
import type { BlogPostRow, BlogSource } from "@/lib/blogPosts";

function slugify(input: string): string {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Used only while the slug field has focus: a trailing hyphen the person
// just typed must survive, or typing "-" after a word is immediately
// swallowed and multi-word slugs become impossible to type by hand.
// slugify() (which strips it) runs on blur and on submit instead.
function slugifyLive(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-+/, "");
}

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
];

type Option = { slug: string; name: string };
type SaveState = "unsaved" | "saving" | "saved" | "error";

type FormState = {
  title: string;
  slug: string;
  category: string;
  authorSlug: string;
  status: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  featureImage: string;
  featureImageAlt: string;
  ogImage: string;
  html: string;
  sources: BlogSource[];
};

function initialFormState(initial?: BlogPostRow, defaultCategory = ""): FormState {
  return {
    title: initial?.title || "",
    slug: initial?.slug || "",
    category: initial?.category || defaultCategory,
    authorSlug: initial?.author_slug || "",
    status: initial?.status || "draft",
    excerpt: initial?.excerpt || "",
    metaTitle: initial?.meta_title || "",
    metaDescription: initial?.meta_description || "",
    featureImage: initial?.feature_image || "",
    featureImageAlt: initial?.feature_image_alt || "",
    ogImage: initial?.og_image || "",
    html: initial?.html || "",
    sources: initial?.sources || [],
  };
}

export default function ConsoleBlogEditor({
  mode,
  initial,
  initialPreviewUrl,
  categories,
  authors,
}: {
  mode: "create" | "edit";
  initial?: BlogPostRow;
  initialPreviewUrl?: string;
  categories: Option[];
  authors: Option[];
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [form, setForm] = useState<FormState>(() => initialFormState(initial, categories[0]?.slug || ""));
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(initialPreviewUrl);
  const [shareModal, setShareModal] = useState<{ title: string; url: string } | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [isDirty, setIsDirty] = useState(false);
  const [hasSavedDraft, setHasSavedDraft] = useState(Boolean(initial));
  const [saveState, setSaveState] = useState<SaveState>(initial ? "saved" : "unsaved");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(initial ? new Date(initial.updated_at) : null);
  const [savingAction, setSavingAction] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState<"feature" | "og" | null>(null);
  const featureFileRef = useRef<HTMLInputElement>(null);
  const ogFileRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const excerptRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const formRef = useRef(form);
  const dirtyRef = useRef(false);
  const revisionRef = useRef(0);
  const savedRevisionRef = useRef(initial ? 0 : -1);
  const savedIdRef = useRef(initial?.id || "");
  const savedSlugRef = useRef(initial?.slug || "");
  const newDraftIdRef = useRef("");

  const publishedAtOpen = mode === "edit" && initial?.status === "published";
  const slugLocked = publishedAtOpen;
  const categoryOptions = categories.map((category) => ({ value: category.slug, label: category.name }));
  const authorOptions = [{ value: "", label: "Default author" }, ...authors.map((author) => ({ value: author.slug, label: author.name }))];

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    dirtyRef.current = true;
    setIsDirty(true);
    revisionRef.current += 1;
    const updatedForm = { ...formRef.current, [key]: value };
    formRef.current = updatedForm;
    setForm(updatedForm);
  }

  function handleTitleChange(value: string) {
    dirtyRef.current = true;
    setIsDirty(true);
    revisionRef.current += 1;
    const updatedForm = {
      ...formRef.current,
      title: value,
      ...(!slugTouched && !slugLocked ? { slug: slugify(value) } : {}),
    };
    formRef.current = updatedForm;
    setForm(updatedForm);
  }

  const persistDraft = useCallback(async (): Promise<boolean> => {
    if (publishedAtOpen) return false;

    const task = saveQueueRef.current.catch(() => true).then(async () => {
      const snapshot = formRef.current;
      const revision = revisionRef.current;
      if (!savedIdRef.current && !newDraftIdRef.current) {
        newDraftIdRef.current = crypto.randomUUID();
      }

      setSaveState("saving");
      setError("");
      const response = await fetch("/api/console/blog/autosave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: savedIdRef.current || newDraftIdRef.current,
          slug: snapshot.slug || slugify(snapshot.title),
          title: snapshot.title,
          html: snapshot.html,
          excerpt: snapshot.excerpt,
          category: snapshot.category,
          author_slug: snapshot.authorSlug || null,
          feature_image: snapshot.featureImage || null,
          feature_image_alt: snapshot.featureImageAlt || null,
          og_image: snapshot.ogImage || null,
          meta_title: snapshot.metaTitle || null,
          meta_description: snapshot.metaDescription || null,
          sources: snapshot.sources,
        }),
      }).catch(() => null);
      const body = await response?.json().catch(() => ({})) ?? {};
      if (!response?.ok || !body.id || !body.slug) {
        setSaveState("error");
        setError(body.error || "Could not save this draft. Check your connection and try again.");
        return false;
      }

      savedIdRef.current = body.id as string;
      savedSlugRef.current = body.slug as string;
      setHasSavedDraft(true);
      if (typeof body.previewUrl === "string") setPreviewUrl(body.previewUrl);
      if (snapshot.slug !== body.slug && formRef.current.slug === snapshot.slug) {
        const updatedForm = { ...formRef.current, slug: body.slug as string };
        formRef.current = updatedForm;
        setForm(updatedForm);
      }
      savedRevisionRef.current = revision;
      setLastSavedAt(new Date());
      if (revisionRef.current === revision) {
        setSaveState("saved");
        setError("");
      } else {
        setSaveState("unsaved");
      }
      return true;
    }).catch(() => {
      setSaveState("error");
      setError("Could not save this draft. Check your connection and try again.");
      return false;
    });

    saveQueueRef.current = task;
    return task;
  }, [publishedAtOpen]);

  async function flushDraft(): Promise<boolean> {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    let saved = await persistDraft();
    while (saved && savedRevisionRef.current < revisionRef.current) {
      saved = await persistDraft();
    }
    return saved;
  }

  useEffect(() => {
    if (!dirtyRef.current || publishedAtOpen) return;
    setSaveState("unsaved");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void persistDraft();
    }, 800);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [form, persistDraft, publishedAtOpen]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  // Title and excerpt wrap onto multiple lines rather than scrolling
  // horizontally, Medium-style -- a plain CSS max-width can't grow a
  // textarea's height to fit, so this resizes it to its content on every
  // keystroke AND via the ref callback below for the initial value. A
  // useEffect keyed on form.title doesn't work here: RichTextEditor's
  // TipTap instance mounts with immediatelyRender:false, so these fields
  // (rendered inside it, via canvasHeader) don't exist in the DOM yet on
  // the first effect pass for an existing post's long saved title -- the
  // ref callback fires exactly when the node actually attaches instead.
  function autoGrow(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  async function uploadImage(file: File, field: "featureImage" | "ogImage") {
    setUploading(field === "featureImage" ? "feature" : "og");
    setError("");
    const data = new FormData();
    data.append("file", file);
    const response = await fetch("/api/console/blog/image-upload", { method: "POST", body: data }).catch(() => null);
    const body = await response?.json().catch(() => ({})) ?? {};
    setUploading(null);
    if (!response?.ok || !body.url) {
      setError(body.error || "Image upload failed.");
      return;
    }
    setField(field, body.url as string);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const statusValue = submitter?.dataset.postStatus;
    const status = statusValue === "draft" || statusValue === "published" ? statusValue : form.status;

    if (status === "draft" && !publishedAtOpen) {
      setSavingAction(true);
      const saved = await flushDraft();
      setSavingAction(false);
      if (saved) router.push("/console/blog");
      return;
    }

    if (status === "published" && !publishedAtOpen && dirtyRef.current) {
      setSavingAction(true);
      const saved = await flushDraft();
      if (!saved) {
        setSavingAction(false);
        return;
      }
      setSavingAction(false);
    }

    setSavingAction(true);
    setError("");
    const submittedForm = formRef.current;
    const payload = {
      slug: submittedForm.slug || slugify(submittedForm.title),
      title: submittedForm.title,
      html: submittedForm.html,
      status,
      category: submittedForm.category,
      author_slug: submittedForm.authorSlug || null,
      feature_image: submittedForm.featureImage || null,
      feature_image_alt: submittedForm.featureImageAlt || null,
      excerpt: submittedForm.excerpt || null,
      meta_title: submittedForm.metaTitle || null,
      meta_description: submittedForm.metaDescription || null,
      og_image: submittedForm.ogImage || null,
      sources: submittedForm.sources,
    };

    const savedSlug = savedSlugRef.current || initial?.slug || "";
    const useUpdate = Boolean(savedSlug);
    const response = await fetch(
      useUpdate ? `/api/console/blog/${encodeURIComponent(savedSlug)}` : "/api/console/blog",
      {
        method: useUpdate ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    ).catch(() => null);
    const body = await response?.json().catch(() => ({})) ?? {};
    setSavingAction(false);
    if (!response?.ok) {
      setError(body.error || "Could not save this post.");
      return;
    }

    const firstPublish = status === "published" && !publishedAtOpen;
    if (firstPublish && typeof body.slug === "string") {
      const liveUrl = `${window.location.origin}/blog/${body.slug}`;
      setPreviewUrl(liveUrl);
      setCopiedShare(false);
      setShareModal({ title: submittedForm.title, url: liveUrl });
      return;
    }
    router.push("/console/blog");
  }

  async function handleBack() {
    if (publishedAtOpen && dirtyRef.current) {
      const leave = await confirm({ message: "This published post has changes that have not been updated. Leave without saving them?", confirmLabel: "Leave" });
      if (!leave) return;
    } else if (!publishedAtOpen && (dirtyRef.current || savedIdRef.current)) {
      const saved = await flushDraft();
      if (!saved) return;
    }
    router.push("/console/blog");
  }

  async function handleDelete() {
    const slug = savedSlugRef.current || initial?.slug;
    if (!slug) return;
    const ok = await confirm({
      message: publishedAtOpen
        ? `Delete the published post “${form.title || "Untitled post"}”? It's a live, search-indexed URL -- this takes it down immediately and removes it from the sitemap. This cannot be undone.`
        : `Delete the draft “${form.title || "Untitled post"}”? This cannot be undone.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setDeleting(true);
    setError("");
    const response = await fetch(`/api/console/blog/${encodeURIComponent(slug)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmPublishedDelete: publishedAtOpen }),
    }).catch(() => null);
    const body = await response?.json().catch(() => ({})) ?? {};
    setDeleting(false);
    if (!response?.ok) {
      setError(body.error || "Could not delete this post.");
      return;
    }
    router.push("/console/blog");
  }

  const saveLabel = publishedAtOpen
    ? isDirty ? "Changes need updating" : "Published"
    : saveState === "saving" ? "Saving…"
    : saveState === "saved" ? `Saved${lastSavedAt ? ` at ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}`
    : saveState === "error" ? "Not saved"
    : "Unsaved changes";
  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault();
      }}
      className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-white text-ink"
    >
      <header className="z-40 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-white px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={handleBack} aria-label="Back to posts" title="Back to posts" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-soft hover:bg-paper-soft hover:text-ink">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m14.5 5-7 7 7 7M8 12h12" /></svg>
          </button>
          <span className={`h-2 w-2 shrink-0 rounded-full ${form.status === "published" ? "bg-ink" : "bg-ink-soft"}`} />
          <span className="truncate text-xs text-ink-soft">{saveLabel}</span>
          {error && <span role="alert" className="hidden max-w-sm truncate text-xs text-red-600 sm:inline">{error}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {previewUrl && (
            <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="hidden h-9 items-center rounded-lg px-3 text-sm font-medium text-ink-soft hover:bg-paper-soft hover:text-ink sm:flex">
              Preview
            </a>
          )}
          <button type="button" onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen} aria-controls="blog-post-settings" className={`flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium hover:bg-paper-soft ${settingsOpen ? "bg-paper-soft" : ""}`}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.5 2.6-1.7-.7a8.2 8.2 0 0 1-1.7 1l-.3 1.8h-3l-.3-1.8a8.2 8.2 0 0 1-1.7-1l-1.7.7-1.5-2.6 1.4-1.1a7.6 7.6 0 0 1 0-2l-1.4-1.1 1.5-2.6 1.7.7a8.2 8.2 0 0 1 1.7-1l.3-1.8h3l.3 1.8a8.2 8.2 0 0 1 1.7 1l1.7-.7 1.5 2.6-1.4 1.1a7.6 7.6 0 0 1 0 2Z" /></svg>
            <span className="hidden sm:inline">Post settings</span>
          </button>
          <button type="submit" data-post-status="published" disabled={savingAction || uploading !== null} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-85 disabled:opacity-50">
            {savingAction ? "Saving…" : publishedAtOpen ? "Update post" : "Publish"}
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {settingsOpen && <button type="button" onClick={() => setSettingsOpen(false)} aria-label="Close post settings" className="absolute inset-0 z-20 bg-ink/20 md:hidden" />}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <RichTextEditor
            value={form.html}
            onChange={(html) => setField("html", html)}
            imageUploadUrl="/api/console/blog/image-upload"
            blogCanvas
            onDeletePost={hasSavedDraft || publishedAtOpen ? handleDelete : undefined}
            canvasHeader={
              <div className="mx-auto w-full max-w-5xl px-6 pt-5 sm:px-12 sm:pt-7 xl:px-16">
                {form.featureImage && (
                  <div className="group relative mb-5 overflow-hidden rounded-2xl border border-line bg-paper-soft">
                    <button type="button" onClick={() => setSettingsOpen(true)} className="block w-full" aria-label="Change featured image in Post settings">
                      <SafeImage src={resolveImage(form.featureImage) || form.featureImage} alt={form.featureImageAlt || form.title || "Featured image"} width={1600} height={900} className="max-h-[420px] w-full object-contain" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setField("featureImage", "")}
                      aria-label="Remove featured image"
                      title="Remove featured image"
                      className="absolute right-3 top-3 hidden h-8 w-8 items-center justify-center rounded-full bg-ink/70 text-base text-white hover:bg-ink group-hover:flex"
                    >
                      ×
                    </button>
                  </div>
                )}
                <label className="sr-only" htmlFor="blog-title">Post title</label>
                <textarea
                  id="blog-title"
                  ref={(el) => { titleRef.current = el; autoGrow(el); }}
                  value={form.title}
                  onChange={(event) => { handleTitleChange(event.target.value); autoGrow(event.target); }}
                  onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
                  placeholder="Post title"
                  rows={1}
                  className="w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-[27px] font-semibold leading-tight tracking-tight text-ink outline-none placeholder:text-ink-soft/55 focus:ring-0 sm:text-[30px]"
                />
                <label className="sr-only" htmlFor="blog-excerpt">Short description</label>
                <textarea
                  id="blog-excerpt"
                  ref={(el) => { excerptRef.current = el; autoGrow(el); }}
                  value={form.excerpt}
                  onChange={(event) => { setField("excerpt", event.target.value); autoGrow(event.target); }}
                  onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
                  placeholder="Add a short description (optional)"
                  rows={1}
                  maxLength={200}
                  className="mt-2 w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-base leading-6 text-ink-soft outline-none placeholder:text-ink-soft/70 focus:ring-0"
                />
              </div>
            }
          />
        </main>

        {settingsOpen && (
          <aside id="blog-post-settings" className="absolute inset-y-0 right-0 z-30 flex w-[min(390px,94vw)] flex-col border-l border-line bg-white shadow-xl md:relative md:w-[360px] md:shrink-0 md:shadow-none">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-5">
              <h2 className="text-sm font-semibold">Post settings</h2>
              <button type="button" onClick={() => setSettingsOpen(false)} aria-label="Collapse post settings" className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft hover:bg-paper-soft">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5-7 7 7 7" /></svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5">
              <section className="border-b border-line py-4">
                <label className="block text-xs font-medium text-ink-soft" htmlFor="blog-slug">URL slug</label>
                <input
                  id="blog-slug"
                  value={form.slug}
                  disabled={slugLocked}
                  onChange={(event) => { setSlugTouched(true); setField("slug", slugifyLive(event.target.value)); }}
                  onBlur={(event) => setField("slug", slugify(event.target.value))}
                  className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-ink disabled:bg-paper-soft disabled:opacity-70"
                />
                <p className="mt-1 break-all text-xs text-ink-soft">{slugLocked ? "Locked after publishing." : `/blog/${form.slug || "post-url-slug"}`}</p>
                <label className="mt-4 block text-xs font-medium text-ink-soft">Category</label>
                <div className="mt-1.5"><BrandSelect value={form.category} onChange={(value) => setField("category", value)} options={categoryOptions} placeholder="Choose a category" /></div>
                <label className="mt-4 block text-xs font-medium text-ink-soft">Author</label>
                <div className="mt-1.5"><BrandSelect value={form.authorSlug} onChange={(value) => setField("authorSlug", value)} options={authorOptions} /></div>
                <label className="mt-4 block text-xs font-medium text-ink-soft">Status</label>
                <div className="mt-1.5"><BrandSelect value={form.status} onChange={(value) => setField("status", value)} options={STATUS_OPTIONS} /></div>
              </section>

              <section className="border-b border-line py-4">
                <h3 className="text-sm font-semibold">Images</h3>
                <label className="mt-3 block text-xs font-medium text-ink-soft" htmlFor="feature-image-url">Featured image</label>
                <div className="mt-1.5 rounded-lg border border-dashed border-line p-3">
                  <button type="button" onClick={() => featureFileRef.current?.click()} disabled={uploading === "feature"} className="flex w-full items-center gap-3 text-left disabled:opacity-50">
                    {form.featureImage ? (
                      <SafeImage src={resolveImage(form.featureImage) || form.featureImage} alt={form.title ? `${form.title} featured image preview` : "Featured image preview"} width={72} height={52} className="h-[52px] w-[72px] shrink-0 rounded-md border border-line object-cover" />
                    ) : (
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-paper-soft">
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 3-3 4 4"/></svg>
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{uploading === "feature" ? "Uploading…" : "Upload featured image"}</span>
                      <span className="mt-0.5 block text-xs text-ink-soft">PNG, JPG, or WEBP</span>
                    </span>
                  </button>
                  <input ref={featureFileRef} type="file" accept="image/*" className="hidden" onChange={(event) => event.target.files?.[0] && uploadImage(event.target.files[0], "featureImage")} />
                  <input id="feature-image-url" placeholder="Or paste an image URL" value={form.featureImage} onChange={(event) => setField("featureImage", event.target.value)} className="mt-3 w-full rounded-md border border-line px-2.5 py-2 text-xs outline-none focus:border-ink" />
                  {form.featureImage && (
                    <>
                      <label className="mt-3 block text-xs font-medium text-ink-soft" htmlFor="feature-image-alt">Alt text</label>
                      <input id="feature-image-alt" placeholder="Describes the image, for screen readers and SEO" value={form.featureImageAlt} onChange={(event) => setField("featureImageAlt", event.target.value)} maxLength={300} className="mt-1.5 w-full rounded-md border border-line px-2.5 py-2 text-xs outline-none focus:border-ink" />
                    </>
                  )}
                </div>

                <label className="mt-4 block text-xs font-medium text-ink-soft" htmlFor="og-image-url">Social share image</label>
                <div className="mt-1.5 rounded-lg border border-dashed border-line p-3">
                  <button type="button" onClick={() => ogFileRef.current?.click()} disabled={uploading === "og"} className="flex w-full items-center gap-3 text-left disabled:opacity-50">
                    {form.ogImage ? (
                      <SafeImage src={resolveImage(form.ogImage) || form.ogImage} alt={form.title ? `${form.title} social share image preview` : "Social share image preview"} width={72} height={52} className="h-[52px] w-[72px] shrink-0 rounded-md border border-line object-cover" />
                    ) : (
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-paper-soft">
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 3-3 4 4"/></svg>
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{uploading === "og" ? "Uploading…" : "Upload social share image"}</span>
                      <span className="mt-0.5 block text-xs text-ink-soft">Shown when shared on social media</span>
                    </span>
                  </button>
                  <input ref={ogFileRef} type="file" accept="image/*" className="hidden" onChange={(event) => event.target.files?.[0] && uploadImage(event.target.files[0], "ogImage")} />
                  <input id="og-image-url" placeholder="Or paste an image URL" value={form.ogImage} onChange={(event) => setField("ogImage", event.target.value)} className="mt-3 w-full rounded-md border border-line px-2.5 py-2 text-xs outline-none focus:border-ink" />
                  <p className="mt-2 text-xs text-ink-soft">Leave blank to reuse the featured image.</p>
                </div>
              </section>

              <section className="border-b border-line py-4">
                <h3 className="text-sm font-semibold">SEO and metadata</h3>
                <label className="mt-3 block text-xs font-medium text-ink-soft" htmlFor="meta-title">Meta title</label>
                <input id="meta-title" value={form.metaTitle} onChange={(event) => setField("metaTitle", event.target.value)} placeholder="Optional custom meta title" className="mt-1.5 w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-ink" />
                <label className="mt-3 block text-xs font-medium text-ink-soft" htmlFor="meta-description">Meta description</label>
                <textarea id="meta-description" value={form.metaDescription} onChange={(event) => setField("metaDescription", event.target.value)} placeholder="Optional custom meta description" rows={3} className="mt-1.5 w-full resize-y rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-ink" />
              </section>

              <section className="py-4">
                <h3 className="text-sm font-semibold">Sources and further reading</h3>
                <p className="mt-1 text-xs text-ink-soft">Shown at the bottom of the published post, if any are added.</p>
                <div className="mt-3 space-y-2">
                  {form.sources.map((source, index) => (
                    <div key={index} className="rounded-lg border border-line p-2.5">
                      <div className="flex items-start gap-1.5">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <input
                            value={source.label}
                            onChange={(event) => setField("sources", form.sources.map((s, i) => (i === index ? { ...s, label: event.target.value } : s)))}
                            placeholder="Source name"
                            className="w-full rounded-md border border-line px-2.5 py-1.5 text-xs outline-none focus:border-ink"
                          />
                          <input
                            value={source.url}
                            onChange={(event) => setField("sources", form.sources.map((s, i) => (i === index ? { ...s, url: event.target.value } : s)))}
                            placeholder="https://..."
                            className="w-full rounded-md border border-line px-2.5 py-1.5 text-xs outline-none focus:border-ink"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setField("sources", form.sources.filter((_, i) => i !== index))}
                          aria-label="Remove source"
                          title="Remove source"
                          className="shrink-0 rounded-md p-1.5 text-ink-soft hover:bg-paper-soft hover:text-red-600"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setField("sources", [...form.sources, { label: "", url: "" }])}
                  className="mt-2 w-full rounded-lg border border-dashed border-line py-2 text-sm font-medium text-ink-soft hover:border-ink hover:text-ink"
                >
                  + Add source
                </button>
              </section>
              {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
            </div>

            <footer className="flex shrink-0 flex-col gap-2 border-t border-line bg-white p-4">
              <button type="submit" data-post-status="published" disabled={savingAction || uploading !== null} className="w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-85 disabled:opacity-50">{savingAction ? "Saving…" : publishedAtOpen ? "Update post" : "Publish"}</button>
              <button type="submit" data-post-status="draft" disabled={savingAction || uploading !== null} className="w-full rounded-lg border border-line px-4 py-2 text-sm font-medium hover:border-ink disabled:opacity-50">Save draft</button>
              {(hasSavedDraft || publishedAtOpen) && <button type="button" onClick={handleDelete} disabled={deleting} className="mt-1 text-sm font-medium text-red-600 hover:underline disabled:opacity-50">{deleting ? "Deleting…" : publishedAtOpen ? "Delete post" : "Delete draft"}</button>}
            </footer>
          </aside>
        )}
      </div>

      {shareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Published</h2>
            <p className="mt-1 text-sm text-ink-soft">&ldquo;{shareModal.title}&rdquo; is live. Share it:</p>
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-line bg-paper-soft px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm">{shareModal.url}</span>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(shareModal.url).then(() => setCopiedShare(true)).catch(() => {})}
                className="shrink-0 rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:border-ink"
              >
                {copiedShare ? "Copied" : "Copy link"}
              </button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareModal.url)}`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-line py-2 text-center text-sm font-medium hover:border-ink">LinkedIn</a>
              <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareModal.url)}`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-line py-2 text-center text-sm font-medium hover:border-ink">Facebook</a>
              <a href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareModal.url)}&text=${encodeURIComponent(shareModal.title)}`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-line py-2 text-center text-sm font-medium hover:border-ink">X</a>
            </div>
            <div className="mt-5 flex items-center justify-between gap-3">
              <a href={shareModal.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium underline">View post</a>
              <button
                type="button"
                onClick={() => { setShareModal(null); router.push("/console/blog"); }}
                className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-85"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
      {dialog}
    </form>
  );
}
