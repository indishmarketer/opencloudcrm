"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Profile } from "@/lib/community";
import { trackEvent } from "@/lib/gtag";

export default function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || "");
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "error" | "done">("idle");
  const [error, setError] = useState("");

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/community/avatar-upload", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Upload failed.");
      setAvatarUrl(body.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    const form = e.currentTarget;
    const username = (form.elements.namedItem("username") as HTMLInputElement).value;
    const bio = (form.elements.namedItem("bio") as HTMLTextAreaElement).value;
    const twitter = (form.elements.namedItem("twitter") as HTMLInputElement).value;
    const linkedin = (form.elements.namedItem("linkedin") as HTMLInputElement).value;
    const instagram = (form.elements.namedItem("instagram") as HTMLInputElement).value;
    const youtube = (form.elements.namedItem("youtube") as HTMLInputElement).value;
    const website = (form.elements.namedItem("website") as HTMLInputElement).value;

    try {
      const res = await fetch("/api/community/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          bio,
          avatarUrl,
          socialLinks: { twitter, linkedin, instagram, youtube, website },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Something went wrong.");
      trackEvent("community_profile_updated", {
        has_avatar: Boolean(avatarUrl),
        has_bio: Boolean(bio.trim()),
      });
      setStatus("done");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-center gap-4">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="Your profile avatar" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="h-16 w-16 rounded-full bg-paper-soft" />
        )}
        <div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="rounded-full border border-line px-4 py-2 text-sm font-medium transition-colors hover:border-ink disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Change photo"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          required
          defaultValue={profile.username || ""}
          placeholder="your-name"
          pattern="[a-z0-9][a-z0-9-]{1,29}"
          className="mt-2 w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
        />
        <p className="mt-1 text-xs text-ink-soft">Lowercase letters, numbers, and hyphens. Your profile URL.</p>
      </div>

      <div>
        <label className="text-sm font-medium" htmlFor="bio">
          Bio
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={3}
          defaultValue={profile.bio || ""}
          className="mt-2 w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(["twitter", "linkedin", "instagram", "youtube", "website"] as const).map((key) => (
          <div key={key}>
            <label className="text-sm font-medium capitalize" htmlFor={key}>
              {key}
            </label>
            <input
              id={key}
              name={key}
              type="text"
              defaultValue={profile.social_links?.[key] || ""}
              placeholder="https://…"
              className="mt-2 w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
            />
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {status === "done" && <p className="text-sm text-ink-soft">Saved.</p>}
      <button
        type="submit"
        disabled={status === "submitting" || uploading}
        className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {status === "submitting" ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
