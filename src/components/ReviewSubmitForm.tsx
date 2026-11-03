"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import Turnstile from "@/components/Turnstile";
import { trackEvent } from "@/lib/gtag";

const MAX_SCREENSHOTS = 4;

export default function ReviewSubmitForm({
  loggedIn,
  name,
}: {
  loggedIn: boolean;
  name?: string;
}) {
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [rating, setRating] = useState(5);
  const [turnstileToken, setTurnstileToken] = useState("");
  const handleToken = useCallback((t: string) => setTurnstileToken(t), []);

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
      const res = await fetch("/api/reviews/image-upload", { method: "POST", body: form });
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
    const data = {
      role: (form.elements.namedItem("role") as HTMLInputElement).value,
      website: (form.elements.namedItem("website") as HTMLInputElement).value,
      message: (form.elements.namedItem("message") as HTMLTextAreaElement).value,
      youtubeUrl: (form.elements.namedItem("youtubeUrl") as HTMLInputElement).value,
      screenshots: images,
      rating,
      turnstileToken,
    };
    try {
      const res = await fetch("/api/reviews/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const responseBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(responseBody.error || "Something went wrong.");
      trackEvent("review_submitted", {
        rating,
        has_screenshot: images.length > 0,
        has_video: Boolean(data.youtubeUrl),
      });
      setStatus("done");
      form.reset();
      setImages([]);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (!loggedIn) {
    return (
      <div className="rounded-2xl border border-line p-8 text-center">
        <p className="font-display text-lg font-semibold">Log in to leave a review</p>
        <p className="mt-2 text-sm text-ink-soft">
          One account for courses, community, comments, and reviews. Log in or create one to
          share your experience.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <Link
            href="/login?redirect=%2Freviews"
            className="rounded-full border border-ink/15 px-6 py-3 text-sm font-medium transition-opacity hover:opacity-80"
          >
            Log in
          </Link>
          <Link
            href="/signup?redirect=%2Freviews"
            className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80"
          >
            Sign up
          </Link>
        </div>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="rounded-2xl border border-line p-8 text-center">
        <p className="font-display text-lg font-semibold">Thanks for sharing.</p>
        <p className="mt-2 text-sm text-ink-soft">
          Your review is in, we&apos;ll take a look before it goes live.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-line p-8">
      <p className="text-sm text-ink-soft">
        Posting as <span className="font-medium text-ink">{name}</span>
      </p>
      <div>
        <label className="text-sm font-medium" htmlFor="role">
          Role / business (optional)
        </label>
        <input
          id="role"
          name="role"
          type="text"
          className="mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink"
        />
      </div>
      <div>
        <label className="text-sm font-medium" htmlFor="website">
          Your website (optional)
        </label>
        <input
          id="website"
          name="website"
          type="text"
          className="mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink"
        />
      </div>
      <div>
        <label className="text-sm font-medium">Rating</label>
        <div className="mt-2 flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm ${
                n <= rating ? "border-ink bg-ink text-paper" : "border-line text-ink-soft"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-sm font-medium" htmlFor="message">
          Your review
        </label>
        <textarea
          id="message"
          name="message"
          rows={5}
          required
          placeholder="What was your experience working with us?"
          className="mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink"
        />
      </div>

      <div>
        <label className="text-sm font-medium" htmlFor="youtubeUrl">
          YouTube video review link (optional)
        </label>
        <input
          id="youtubeUrl"
          name="youtubeUrl"
          type="text"
          placeholder="https://youtube.com/watch?v=..."
          className="mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink"
        />
      </div>

      <div>
        <label className="text-sm font-medium">Screenshots / proof (optional, up to {MAX_SCREENSHOTS})</label>
        {images.length > 0 && (
          <div className="mt-2 grid grid-cols-4 gap-2">
            {images.map((url, i) => (
              <div key={url} className="group relative aspect-square overflow-hidden rounded-lg border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Review screenshot ${i + 1}`} className="h-full w-full object-cover" />
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
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || images.length >= MAX_SCREENSHOTS}
            className="rounded-full border border-line px-4 py-1.5 text-xs font-medium transition-colors hover:border-ink disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Add image"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={handleImageChange}
          />
        </div>
      </div>

      {(status === "error" || error) && (
        <p className="text-sm text-red-600">{error || "Something went wrong. Try again."}</p>
      )}
      <Turnstile onToken={handleToken} />
      <button
        type="submit"
        disabled={status === "submitting" || uploading || !turnstileToken}
        className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {status === "submitting" ? "Sending…" : "Submit review"}
      </button>
    </form>
  );
}
