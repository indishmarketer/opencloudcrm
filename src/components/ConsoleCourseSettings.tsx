"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SafeImage from "@/components/SafeImage";
import { useConfirm } from "@/components/ConfirmDialog";
import MediaLibraryPicker from "@/components/MediaLibraryPicker";
import BrandSelect from "@/components/BrandSelect";
import { convertCoursePrice, formatCoursePrice } from "@/lib/currency";
import { ASSET_DOMAIN } from "@/config/brand";

type Course = {
  id: number;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  cover_image_url: string | null;
  price: number | null;
  price_currency: "INR" | "USD";
  published: boolean;
};

type Module = {
  id: number;
  tier: "free" | "pro";
  position: number;
};

type Lesson = {
  id: number;
  module_id: number;
  video_type: "youtube" | "r2";
  video_ref: string | null;
  position: number;
};

export default function ConsoleCourseSettings({
  course,
  modules,
  lessons,
  inrPerUsd,
}: {
  course: Course;
  modules: Module[];
  lessons: Lesson[];
  inrPerUsd: number;
}) {
  const router = useRouter();
  const [form, setForm] = useState(course);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  const { confirm, dialog } = useConfirm();
  const pricePreview = convertCoursePrice(form.price, form.price_currency, inrPerUsd);

  // Readiness Checklist Evaluation
  const hasFreeTier = modules.some((m) => m.tier === "free");
  const hasProTier = modules.some((m) => m.tier === "pro");
  const isMixed = hasFreeTier && hasProTier;
  const isProOnly = hasProTier && !hasFreeTier;
  const isFreeOnly = hasFreeTier && !hasProTier;

  const errors: string[] = [];
  if (!form.title) errors.push("Title is required.");
  if (!form.slug) errors.push("Slug is required.");
  if (!form.description) errors.push("Description is required.");
  if (!form.cover_image_url) errors.push("Cover image is missing.");
  if (modules.length === 0) errors.push("At least one module is required.");
  if (lessons.length === 0) errors.push("At least one lesson is required.");
  if (hasProTier && !form.price) {
    errors.push("PRO modules require a price.");
  }
  
  // Checking missing videos for video lessons
  const missingVideos = lessons.filter(l => !l.video_ref);
  if (missingVideos.length > 0) {
    errors.push(`There are ${missingVideos.length} lesson(s) missing a video reference.`);
  }

  const handleSave = async (publishAttempt?: boolean) => {
    if (publishAttempt && errors.length > 0) {
      setError("Please fix the readiness issues before publishing.");
      return;
    }

    setBusy(true);
    setError("");
    setSuccess(false);

    try {
      const res = await fetch(`/api/console/courses/${course.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          published: publishAttempt !== undefined ? publishAttempt : form.published,
        }),
      });
      const response = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(response.error || "Failed to save course settings.");
        return;
      }
      if (response.course) setForm(response.course);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  async function handleCoverUpload(file: File | undefined) {
    if (!file) return;
    setUploadingCover(true);
    setError("");
    const body = new FormData();
    body.set("file", file);
    try {
      const res = await fetch(`/api/console/courses/${course.id}/cover`, { method: "POST", body });
      const response = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(response.error || "Could not upload the cover image.");
      setForm((current) => ({ ...current, cover_image_url: response.url }));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      router.refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not upload the cover image.");
    } finally {
      setUploadingCover(false);
    }
  }

  async function handleDeleteCourse() {
    const ok = await confirm({
      message: `Permanently delete the draft course “${form.title}” and all of its draft modules, lessons, resources, and uploaded videos? This cannot be undone.`,
      confirmLabel: "Delete draft",
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/console/courses/${course.id}`, { method: "DELETE" });
      const response = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(response.error || "Could not delete this course.");
      router.push("/console/courses");
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete this course.");
      setBusy(false);
    }
  }

  const coverCanPreview = Boolean(
    form.cover_image_url &&
    (form.cover_image_url.startsWith("/") || form.cover_image_url.startsWith(`https://${ASSET_DOMAIN}/`)),
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
      <div className="md:col-span-2 space-y-6">
        <div className="bg-paper border border-line rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold text-lg">General Settings</h2>
          
          <div>
            <label className="text-xs font-medium text-ink-soft">Title</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="mt-1 w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-ink-soft">URL Slug</label>
            <input
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              className="mt-1 w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-ink-soft">Subtitle (short description)</label>
            <input
              value={form.subtitle || ""}
              onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
              className="mt-1 w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-ink-soft">Description</label>
            <textarea
              value={form.description || ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={5}
              className="mt-1 w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-ink-soft mb-1 block">Course cover</label>
            {coverCanPreview && form.cover_image_url && (
              <div className="relative mb-3 aspect-[1200/650] overflow-hidden rounded-xl border border-line">
                <SafeImage src={form.cover_image_url} alt={`${form.title} course cover`} fill className="object-cover" />
              </div>
            )}
            <input
              value={form.cover_image_url || ""}
              onChange={(e) => setForm({ ...form, cover_image_url: e.target.value })}
              className="mt-1 w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
              placeholder="Paste an HTTPS image URL"
            />
            <p className="mt-1 text-xs text-ink-soft">
              A pasted external image is securely copied into this site&apos;s Cloudflare R2 storage when you save.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="cursor-pointer rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink">
                {uploadingCover ? "Uploading…" : "Upload image"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  disabled={uploadingCover}
                  onChange={(event) => handleCoverUpload(event.target.files?.[0])}
                  className="sr-only"
                />
              </label>
              <button
                type="button"
                onClick={() => setMediaLibraryOpen(true)}
                className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink"
              >
                Choose from media library
              </button>
              {form.cover_image_url && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, cover_image_url: null })}
                  className="rounded-full border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:border-red-600 hover:bg-red-50"
                >
                  Remove cover
                </button>
              )}
              <span className="text-xs text-ink-soft">PNG, JPEG, GIF, or WEBP · maximum 5MB</span>
            </div>
          </div>
        </div>

        <div className="bg-paper border border-line rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold text-lg">Pricing & Payment</h2>
          
          <div>
            <label className="text-xs font-medium text-ink-soft" htmlFor="course-price">Price</label>
            <div className="mt-1 flex gap-2">
              <div className="w-28 shrink-0">
                <BrandSelect
                  value={form.price_currency}
                  onChange={(v) => setForm({ ...form, price_currency: v === "USD" ? "USD" : "INR" })}
                  options={[
                    { value: "INR", label: "₹ INR" },
                    { value: "USD", label: "$ USD" },
                  ]}
                />
              </div>
              <input
                id="course-price"
                type="number"
                min={0}
                step={1}
                value={form.price ?? ""}
                onChange={(e) => setForm({ ...form, price: e.target.value ? Math.round(Number(e.target.value)) : null })}
                className="w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
              />
            </div>
            {pricePreview.inr != null && pricePreview.usd != null ? (
              <p className="mt-2 text-xs text-ink-soft">
                Razorpay charges {formatCoursePrice(pricePreview.inr, "INR")}, PayPal charges {formatCoursePrice(pricePreview.usd, "USD")}.
                The other currency converts at today&apos;s rate.
              </p>
            ) : (
              <p className="mt-2 text-xs text-ink-soft">Leave empty for a free course.</p>
            )}
          </div>
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={() => handleSave()}
            disabled={busy}
            className="rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {busy ? "Saving..." : "Save Settings"}
          </button>
          {success && <span className="text-green-600 text-sm self-center">Saved!</span>}
          {error && <span className="text-red-600 text-sm self-center">{error}</span>}
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-paper border border-line rounded-2xl p-6">
          <h2 className="font-semibold text-lg mb-4">Publication Readiness</h2>
          
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <div className="mt-0.5">{form.title && form.slug && form.description ? '✅' : '❌'}</div>
              <div>Title, slug, description present</div>
            </div>
            <div className="flex items-start gap-2">
              <div className="mt-0.5">{form.cover_image_url ? '✅' : '❌'}</div>
              <div>Cover image present</div>
            </div>
            <div className="flex items-start gap-2">
              <div className="mt-0.5">{modules.length > 0 && lessons.length > 0 ? '✅' : '❌'}</div>
              <div>Has modules and lessons</div>
            </div>
            <div className="flex items-start gap-2">
              <div className="mt-0.5">
                {!hasProTier || form.price ? '✅' : '❌'}
              </div>
              <div>PRO tier priced (if applicable)</div>
            </div>
            <div className="flex items-start gap-2">
              <div className="mt-0.5">{missingVideos.length === 0 ? '✅' : '⚠️'}</div>
              <div>Every lesson has a video</div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-line">
            <div className="text-sm font-medium mb-1 text-ink-soft">Course Structure:</div>
            <div className="text-sm font-semibold">
              {isMixed ? "Mixed (FREE + PRO)" : isProOnly ? "PRO only" : isFreeOnly ? "FREE only" : "Empty"}
            </div>
          </div>

          <div className="mt-6">
            {!form.published ? (
              <button
                onClick={() => handleSave(true)}
                disabled={busy || errors.length > 0}
                className="w-full rounded-full bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Publish Course
              </button>
            ) : (
              <button
                onClick={() => handleSave(false)}
                disabled={busy}
                className="w-full rounded-full border border-line px-4 py-2.5 text-sm font-medium hover:border-ink disabled:opacity-50"
              >
                Unpublish to Draft
              </button>
            )}
            {errors.length > 0 && !form.published && (
              <p className="text-xs text-red-600 mt-2">
                Resolve {errors.length} issue{errors.length > 1 ? 's' : ''} to publish.
              </p>
            )}
          </div>
        </div>
        {!form.published && (
          <div className="rounded-2xl border border-red-600 p-6">
            <h2 className="font-semibold text-red-600">Delete draft course</h2>
            <p className="mt-2 text-sm text-ink-soft">
              Available only for unpublished courses without enrollments, payment claims, waitlist signups, or active email flows.
            </p>
            <button
              type="button"
              onClick={handleDeleteCourse}
              disabled={busy}
              className="mt-4 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Delete draft permanently
            </button>
          </div>
        )}
      </div>
      {dialog}
      {mediaLibraryOpen && (
        <MediaLibraryPicker
          onClose={() => setMediaLibraryOpen(false)}
          onSelect={(url) => {
            setForm((current) => ({ ...current, cover_image_url: url }));
            setMediaLibraryOpen(false);
          }}
        />
      )}
    </div>
  );
}
