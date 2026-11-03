"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ConsoleModal from "@/components/ConsoleModal";
import { useConfirm } from "@/components/ConfirmDialog";
import BrandSelect from "@/components/BrandSelect";
import { formatIndiaDateTime } from "@/lib/indiaTime";

type Campaign = {
  id: number;
  subject: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  scheduled_at: string | null;
  sent_count: number;
  skipped_count: number;
  failed_count: number;
  recipient_count: number;
  opened_count: number;
  clicked_count: number;
  bounced_count: number;
  segment_name: string | null;
  last_error: string | null;
  source_post_slug: string | null;
};

type RecentPost = { slug: string; title: string; alreadySent: boolean };

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-paper-soft text-ink-soft",
  sending: "bg-amber-100 text-amber-800",
  scheduled: "bg-blue-50 text-blue-800",
  sent: "bg-emerald-100 text-emerald-800",
  completed_with_errors: "bg-red-50 text-red-700",
};

export default function ConsoleEmailCampaigns({ campaigns, recentPosts }: { campaigns: Campaign[]; recentPosts: RecentPost[] }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<"blank" | "post">("blank");
  const [subject, setSubject] = useState("");
  const [postSlug, setPostSlug] = useState(recentPosts[0]?.slug || "");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  function openModal() {
    setMode("blank");
    setSubject("");
    setPostSlug(recentPosts[0]?.slug || "");
    setError("");
    setCreating(true);
  }

  async function handleCreate() {
    setError("");
    if (mode === "post") {
      if (!postSlug) return;
      setSaving(true);
      const res = await fetch("/api/console/email/campaigns/from-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: postSlug }),
      });
      const body = await res.json().catch(() => ({}));
      setSaving(false);
      if (res.ok) router.push(`/console/email/campaigns/${body.id}`);
      else setError(body.error || "Could not create this campaign.");
      return;
    }
    if (!subject.trim()) return;
    setSaving(true);
    const res = await fetch("/api/console/email/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) router.push(`/console/email/campaigns/${body.id}`);
    else setError(body.error || "Could not create this campaign.");
  }

  async function handleDelete(e: React.MouseEvent, campaign: Campaign) {
    e.preventDefault();
    e.stopPropagation();
    const ok = await confirm({
      message: `Delete "${campaign.subject}"? This removes it and its send history permanently.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setDeletingId(campaign.id);
    const res = await fetch(`/api/console/email/campaigns/${campaign.id}`, { method: "DELETE" });
    setDeletingId(null);
    if (res.ok) router.refresh();
  }

  return (
    <div>
      <button type="button" onClick={openModal} className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80">New campaign</button>
      <div className="mt-6 space-y-3">
        {campaigns.length === 0 && <p className="text-sm text-ink-soft">No campaigns yet.</p>}
        {campaigns.map((campaign) => (
          <Link key={campaign.id} href={`/console/email/campaigns/${campaign.id}`} className="flex items-center justify-between gap-4 rounded-xl border border-line bg-paper px-5 py-4 text-sm transition-colors hover:border-ink">
            <div>
              <p className="font-medium">{campaign.subject}</p>
              <p className="mt-1 text-xs text-ink-soft">
                {campaign.status === "draft" ? "Draft" : campaign.status === "scheduled" ? `Scheduled for ${campaign.scheduled_at ? `${formatIndiaDateTime(campaign.scheduled_at)} IST` : "an upcoming time"}` : `${campaign.sent_count}/${campaign.recipient_count} sent · ${campaign.opened_count} opened · ${campaign.clicked_count} clicked${campaign.bounced_count ? ` · ${campaign.bounced_count} bounced/complained` : ""}${campaign.failed_count ? ` · ${campaign.failed_count} failed` : ""}${campaign.skipped_count ? ` · ${campaign.skipped_count} skipped` : ""}`}
              </p>
              {campaign.segment_name && <p className="mt-1 text-xs text-ink-soft">Segment: {campaign.segment_name}</p>}
              {campaign.source_post_slug && (
                <p className="mt-1 text-xs text-ink-soft">From blog post: /{campaign.source_post_slug}</p>
              )}
              {campaign.last_error && <p className="mt-1 text-xs text-red-600">{campaign.last_error}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[campaign.status] || "bg-paper-soft text-ink-soft"}`}>{campaign.status.replace(/_/g, " ")}</span>
              <button
                type="button"
                onClick={(e) => handleDelete(e, campaign)}
                disabled={deletingId === campaign.id}
                className="text-xs text-red-700 hover:underline disabled:opacity-50"
              >
                {deletingId === campaign.id ? "Deleting..." : "Delete"}
              </button>
            </div>
          </Link>
        ))}
      </div>
      {dialog}
      {creating && (
        <ConsoleModal title="New campaign" onClose={() => setCreating(false)}>
          <div className="space-y-4">
            <div className="flex gap-2 rounded-full bg-paper-soft p-1 text-sm">
              <button
                type="button"
                onClick={() => setMode("blank")}
                className={`flex-1 rounded-full px-3 py-1.5 font-medium transition-colors ${mode === "blank" ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"}`}
              >
                Blank
              </button>
              <button
                type="button"
                onClick={() => setMode("post")}
                disabled={recentPosts.length === 0}
                className={`flex-1 rounded-full px-3 py-1.5 font-medium transition-colors disabled:opacity-50 ${mode === "post" ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"}`}
              >
                From a blog post
              </button>
            </div>

            {mode === "blank" ? (
              <div>
                <label className="text-sm font-medium">Subject</label>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. What's new this month" className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink" />
              </div>
            ) : (
              <div>
                <label className="text-sm font-medium">Blog post</label>
                <div className="mt-1">
                  <BrandSelect
                    value={postSlug}
                    onChange={setPostSlug}
                    wrapOptions
                    options={recentPosts.map((post) => ({
                      value: post.slug,
                      label: post.alreadySent ? `${post.title} (already sent)` : post.title,
                    }))}
                  />
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  The post&rsquo;s title, excerpt, and opening paragraphs fill the draft automatically, with a &ldquo;Read the full post&rdquo; button. Edit anything before sending.
                </p>
                {recentPosts.find((p) => p.slug === postSlug)?.alreadySent && (
                  <p className="mt-1 text-xs text-amber-700">This post was already sent as a newsletter before.</p>
                )}
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving || (mode === "blank" ? !subject.trim() : !postSlug)}
              className="w-full rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create draft"}
            </button>
          </div>
        </ConsoleModal>
      )}
    </div>
  );
}
