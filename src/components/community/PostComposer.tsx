"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BrandSelect from "@/components/BrandSelect";
import type { Category, Space } from "@/lib/community";
import { trackEvent } from "@/lib/gtag";

export default function PostComposer({ space, categories }: { space: Space; categories: Category[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const [body, setBody] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/community/post-image-upload", { method: "POST", body: form });
      const responseBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(responseBody.error || "Upload failed.");
      setImages((prev) => [...prev, responseBody.url]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeImage(url: string) {
    setImages((prev) => prev.filter((u) => u !== url));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    const form = e.currentTarget;
    const title = (form.elements.namedItem("title") as HTMLInputElement).value;
    const categoryId = (form.elements.namedItem("categoryId") as HTMLSelectElement).value;
    const fullBody = [body.trim(), ...images.map((url) => `![](${url})`)].filter(Boolean).join("\n\n");

    try {
      const res = await fetch("/api/community/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          space,
          title,
          body: fullBody,
          categoryId: categoryId ? Number(categoryId) : null,
        }),
      });
      const responseBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(responseBody.error || "Something went wrong.");

      trackEvent("community_post_created", {
        community_space: space,
        moderation_status: responseBody.status,
        has_image: images.length > 0,
      });

      if (responseBody.status === "pending") {
        setOpen(false);
        setStatus("idle");
        setBody("");
        setImages([]);
        router.refresh();
      } else {
        router.push(`/community/${space}/${responseBody.id}`);
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-line bg-paper px-5 py-4 text-left text-sm text-ink-soft transition-colors hover:border-ink"
      >
        Write something…
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border border-line bg-paper p-5"
    >
      <input
        name="title"
        type="text"
        required
        placeholder="Title"
        className="w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
      />
      <textarea
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required={images.length === 0}
        rows={5}
        placeholder="What's on your mind?"
        className="w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
      />

      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((url) => (
            <div key={url} className="group relative aspect-square overflow-hidden rounded-lg border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="Uploaded image preview" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(url)}
                className="absolute right-1 top-1 rounded-full bg-ink/70 px-1.5 py-0.5 text-xs text-paper opacity-0 transition-opacity group-hover:opacity-100"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="rounded-full border border-line px-4 py-1.5 text-xs font-medium transition-colors hover:border-ink disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Add photo"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="hidden"
          onChange={handleImageChange}
        />
      </div>

      {categories.length > 0 && (
        <>
          <input type="hidden" name="categoryId" value={categoryId} />
          <BrandSelect
            value={categoryId}
            onChange={setCategoryId}
            placeholder="No category"
            options={[
              { value: "", label: "No category" },
              ...categories.map((c) => ({ value: String(c.id), label: c.name })),
            ]}
          />
        </>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={status === "submitting" || uploading}
          className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {status === "submitting" ? "Posting…" : "Post"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full border border-line px-5 py-2 text-sm font-medium transition-colors hover:border-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
