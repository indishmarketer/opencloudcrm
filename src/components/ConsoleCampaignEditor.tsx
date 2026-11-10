"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BrandSelect from "@/components/BrandSelect";
import RichTextEditor from "@/components/RichTextEditor";
import ScheduleDateTimeModal from "@/components/ScheduleDateTimeModal";
import { useConfirm } from "@/components/ConfirmDialog";
import { CONTACT_MESSAGE_VARIABLES } from "@/lib/messageVariables";
import { formatIndiaDateTime } from "@/lib/indiaTime";
import type { EmailContentTemplate } from "@/lib/emailContentTemplates";

type Campaign = {
  id: number;
  subject: string;
  html: string;
  status: string;
  audience: string;
  from_email: string;
  segment_id: number | null;
  scheduled_at: string | null;
};

export default function ConsoleCampaignEditor({ campaign, segments, templates, report }: {
  campaign: Campaign;
  segments: { id: number; name: string; count: number }[];
  /** Reusable content from Email → Templates. Picking one copies its
   * subject/content in; nothing stays linked afterward. */
  templates: EmailContentTemplate[];
  /** Results once it has been sent: shown as tabs beside the read-only email. */
  report?: { analytics: React.ReactNode; recipients: React.ReactNode };
}) {
  const [tab, setTab] = useState<"analytics" | "recipients" | "email">(report ? "analytics" : "email");
  const router = useRouter();
  const [subject, setSubject] = useState(campaign.subject);
  const [html, setHtml] = useState(campaign.html);
  const [segmentId, setSegmentId] = useState(String(campaign.segment_id || segments[0]?.id || ""));
  const [fromEmail, setFromEmail] = useState(campaign.from_email);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");
  const [testTo, setTestTo] = useState("");
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "error">("idle");
  const [sendMessage, setSendMessage] = useState("");
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const { confirm, dialog } = useConfirm();

  const isDraft = campaign.status === "draft";
  const isScheduled = campaign.status === "scheduled";

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/console/email/campaigns/${campaign.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, html, segmentId: Number(segmentId), fromEmail }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setSendMessage(body.error || "Could not save this campaign.");
      setSendStatus("error");
      return false;
    }
    setDirty(false);
    return true;
  }

  async function sendTest() {
    setTestStatus("sending");
    const res = await fetch(`/api/console/email/campaigns/${campaign.id}/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, html, fromEmail, testTo }),
    });
    const body = await res.json().catch(() => ({}));
    setTestStatus(res.ok ? "sent" : "error");
    setTestMessage(res.ok ? `Sent to ${body.sentTo}` : body.error || "Something went wrong.");
    setTimeout(() => setTestStatus("idle"), 6000);
  }

  async function sendNow() {
    const ok = await confirm({
      message: `Send "${subject}" to ${segments.find((segment) => String(segment.id) === segmentId)?.count || 0} currently eligible contacts in "${segments.find((segment) => String(segment.id) === segmentId)?.name || "this segment"}"? This can't be undone.`,
      confirmLabel: "Send",
    });
    if (!ok) return;
    if (dirty && !(await save())) return;
    setSendStatus("sending");
    const res = await fetch(`/api/console/email/campaigns/${campaign.id}/send`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSendStatus("error");
      setSendMessage(body.error || "Something went wrong.");
      return;
    }
    router.push("/console/email/campaigns");
    router.refresh();
  }

  async function scheduleCampaign(scheduledAt: string) {
    if (dirty && !(await save())) return;
    setScheduleBusy(true);
    setSendStatus("idle");
    const res = await fetch(`/api/console/email/campaigns/${campaign.id}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduledAt }),
    });
    const body = await res.json().catch(() => ({}));
    setScheduleBusy(false);
    if (!res.ok) {
      setSendStatus("error");
      setSendMessage(body.error || "Could not schedule this campaign.");
      return;
    }
    setScheduleModalOpen(false);
    router.push("/console/email/campaigns");
    router.refresh();
  }

  async function cancelSchedule() {
    const ok = await confirm({
      message: `Cancel the scheduled send${campaign.scheduled_at ? ` for ${formatIndiaDateTime(campaign.scheduled_at)} IST` : ""}? The campaign will return to draft so you can edit or reschedule it.`,
      confirmLabel: "Cancel schedule",
    });
    if (!ok) return;
    setScheduleBusy(true);
    const res = await fetch(`/api/console/email/campaigns/${campaign.id}/schedule`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    setScheduleBusy(false);
    if (!res.ok) {
      setSendStatus("error");
      setSendMessage(body.error || "Could not cancel this schedule.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <Link href="/console/email/campaigns" className="text-sm text-ink-soft hover:text-ink">
        ← Campaigns
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">{isDraft ? "Edit campaign" : "Campaign"}</h1>
        {!isDraft && (
          <span className="rounded-full bg-paper-soft px-3 py-1 text-xs font-medium text-ink-soft">
            {campaign.status} — read only
          </span>
        )}
        {isScheduled && <div className="ml-auto flex flex-wrap items-center gap-3">
          <p className="text-sm text-ink-soft">Scheduled for {campaign.scheduled_at ? `${formatIndiaDateTime(campaign.scheduled_at)} IST` : "an upcoming time"}</p>
          <button type="button" onClick={cancelSchedule} disabled={scheduleBusy} className="rounded-full border border-line px-4 py-2 text-sm font-medium disabled:opacity-50">{scheduleBusy ? "Working…" : "Cancel schedule"}</button>
        </div>}
      </div>

      {report && (
        <div className="mt-6 flex gap-1 border-b border-line text-sm" role="tablist">
          {(["analytics", "recipients", "email"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`-mb-px border-b-2 px-4 py-2 font-medium capitalize transition-colors ${
                tab === key ? "border-ink text-ink" : "border-transparent text-ink-soft hover:text-ink"
              }`}
            >
              {key}
            </button>
          ))}
        </div>
      )}
      {report && tab === "analytics" && <div className="mt-6">{report.analytics}</div>}
      {report && tab === "recipients" && <div className="mt-6">{report.recipients}</div>}

      <div className={`${report ? "mt-6" : "mt-8"} space-y-4 ${tab === "email" ? "" : "hidden"}`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[220px]">
            <label className="text-sm text-ink-soft">Send to</label>
            <div className="mt-1">
              <BrandSelect
                value={segmentId}
                onChange={(v) => {
                  setSegmentId(v);
                  setDirty(true);
                }}
                options={segments.map((segment) => ({ value: String(segment.id), label: `${segment.name} (${segment.count})` }))}
                disabled={!isDraft}
                compact
              />
            </div>
            <p className="mt-1 text-xs text-ink-soft">Only verified, sendable contacts are included. The final recipient list is frozen when sending starts.</p>
          </div>
          <div className="min-w-[220px]">
            <label className="text-sm text-ink-soft" htmlFor="campaign-from-email">From</label>
            <input
              id="campaign-from-email"
              type="email"
              value={fromEmail}
              onChange={(e) => {
                setFromEmail(e.target.value);
                setDirty(true);
              }}
              disabled={!isDraft}
              className="mt-1 w-full rounded-full border border-line bg-paper px-3.5 py-2 text-sm outline-none focus:border-ink disabled:opacity-60"
            />
          </div>
        </div>

        {isDraft && templates.length > 0 && (
          <div className="min-w-[260px] max-w-sm">
            <label className="text-sm text-ink-soft">Start from a template</label>
            <div className="mt-1">
              <BrandSelect
                value=""
                placeholder="Pick a template"
                onChange={(id) => {
                  const template = templates.find((t) => String(t.id) === id);
                  if (!template) return;
                  setSubject(template.subject);
                  setHtml(template.body_html);
                  setDirty(true);
                }}
                options={templates.map((t) => ({ value: String(t.id), label: t.name }))}
                compact
              />
            </div>
            <p className="mt-1 text-xs text-ink-soft">Copies its subject and content in — still fully editable after.</p>
          </div>
        )}

        <div>
          <label className="text-sm font-medium">Subject</label>
          <input
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setDirty(true);
            }}
            disabled={!isDraft}
            className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink disabled:opacity-60"
          />
          {isDraft && <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-soft">Insert recipient field:</span>
            {CONTACT_MESSAGE_VARIABLES.map((variable) => (
              <button
                key={variable.token}
                type="button"
                onClick={() => {
                  setSubject((current) => `${current}{{${variable.token}}}`);
                  setDirty(true);
                }}
                className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-soft transition-colors hover:border-ink"
              >
                {variable.label}
              </button>
            ))}
          </div>}
        </div>

        <div>
          <label className="text-sm font-medium">Content</label>
          <div className="mt-1">
            <RichTextEditor
              value={html}
              variables={isDraft ? CONTACT_MESSAGE_VARIABLES : undefined}
              onChange={(v) => {
                setHtml(v);
                setDirty(true);
              }}
            />
          </div>
          <p className="mt-1.5 text-xs text-ink-soft">Recipient fields are filled separately for every contact when the campaign sends.</p>
        </div>

        {isDraft && (
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {saving ? "Saving..." : dirty ? "Save changes" : "Saved"}
            </button>
            <input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="Send test to (default: you)"
              aria-label="Send test to"
              className="w-60 rounded-full border border-line bg-paper px-4 py-2 text-sm outline-none focus:border-ink"
            />
            <button
              type="button"
              onClick={sendTest}
              disabled={testStatus === "sending"}
              className="rounded-full border border-line px-4 py-2 text-sm font-medium transition-colors hover:border-ink disabled:opacity-50"
            >
              {testStatus === "sending" ? "Sending test..." : "Send test"}
            </button>
            {(testStatus === "sent" || testStatus === "error") && (
              <p className={`text-xs ${testStatus === "sent" ? "text-emerald-700" : "text-red-600"}`}>{testMessage}</p>
            )}
            <button
              type="button"
              onClick={() => {
                setSendStatus("idle");
                setScheduleModalOpen(true);
              }}
              disabled={scheduleBusy || sendStatus === "sending"}
              className="h-10 rounded-full border border-line px-5 text-sm font-medium hover:border-ink disabled:opacity-50"
            >
              {scheduleBusy ? "Scheduling…" : "Schedule campaign"}
            </button>
            <button
              type="button"
              onClick={sendNow}
              disabled={sendStatus === "sending"}
              className="ml-auto h-10 rounded-full bg-red-600 px-5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {sendStatus === "sending" ? "Sending..." : "Send now"}
            </button>
          </div>
        )}
        {sendStatus === "error" && !scheduleModalOpen && <p className="text-sm text-red-600">{sendMessage}</p>}
      </div>
      {isScheduled && <p className="mt-4 rounded-xl border border-line bg-paper-soft p-4 text-sm text-ink-soft">The recipient list will be frozen and delivery will begin at the scheduled time. Times are shown in India Standard Time (IST).</p>}
      {dialog}
      {scheduleModalOpen && <ScheduleDateTimeModal
        title="Schedule campaign"
        actionLabel="Schedule campaign"
        initialValue=""
        busy={scheduleBusy}
        error={sendStatus === "error" ? sendMessage : ""}
        onClose={() => setScheduleModalOpen(false)}
        onSchedule={scheduleCampaign}
      />}
    </div>
  );
}
