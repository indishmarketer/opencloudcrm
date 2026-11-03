"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BrandSelect from "@/components/BrandSelect";
import ConsoleModal from "@/components/ConsoleModal";
import ContactGrantCourse from "@/components/ContactGrantCourse";
import ContactWhatsAppSend from "@/components/ContactWhatsAppSend";
import RichTextEditor from "@/components/RichTextEditor";
import ScheduleDateTimeModal from "@/components/ScheduleDateTimeModal";
import { useConfirm } from "@/components/ConfirmDialog";
import { SENDER_ADDRESSES } from "@/lib/emailSenders";
import { TEMPLATE_VARIABLES } from "@/lib/messageVariables";
import type { EmailContentTemplate } from "@/lib/emailContentTemplates";
import { formatIndiaDateTime } from "@/lib/indiaTime";

type Course = { id: number; title: string; has_free_tier: boolean };

/** Everything that can be *done* to a contact, in one place.
 *
 * It used to be scattered down the page: a Google review section here, an
 * email composer there, course access buried under the enrolment list, and
 * nothing at all for WhatsApp or community. Worse, the review request
 * fired the moment it was clicked -- a real email to a real person with no
 * way back. Every action here either opens a form or asks first. */
export default function ContactActions({
  contactId,
  name,
  email,
  phone,
  hasAccount,
  emailEligible,
  whatsappStatus,
  whatsappMessageCount,
  hasGoogleReviewLink,
  communityActive,
  courses,
  replyToEmail,
}: {
  contactId: number;
  /** Where replies to console-sent emails land (the business contact email). */
  replyToEmail: string;
  name: string | null;
  email: string;
  phone: string | null;
  hasAccount: boolean;
  /** Not unsubscribed, not bounced: email can actually go out. */
  emailEligible: boolean;
  whatsappStatus: string;
  whatsappMessageCount: number;
  hasGoogleReviewLink: boolean;
  communityActive: boolean;
  courses: Course[];
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [open, setOpen] = useState<"email" | "whatsapp" | "course" | "review" | null>(null);
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const whatsappBlocked = whatsappStatus === "unsubscribed" || !phone;

  async function sendReview(channel: "email" | "whatsapp") {
    const ok = await confirm({
      message: `Send the Google review request by ${channel === "email" ? "email" : "WhatsApp"} to ${email} now? It goes out immediately.`,
      confirmLabel: "Send it",
    });
    if (!ok) return;
    setBusy("review");
    setFeedback(null);
    const res = await fetch("/api/console/review-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        channel === "whatsapp"
          ? { contactId, channel: "whatsapp" }
          : { contactId, templateKey: "google-review-request" },
      ),
    });
    const body = await res.json().catch(() => ({}));
    setBusy("");
    setFeedback(
      res.ok
        ? { kind: "ok", text: channel === "whatsapp" ? "WhatsApp review request queued." : "Google review request queued." }
        : { kind: "error", text: body.error || "Could not queue that request." },
    );
    if (res.ok) {
      setOpen(null);
      router.refresh();
    }
  }

  async function toggleCommunity() {
    const ok = await confirm({
      message: communityActive
        ? "Remove PRO community access from this contact?"
        : "Give this contact PRO community access?",
      confirmLabel: communityActive ? "Remove" : "Give access",
    });
    if (!ok) return;
    setBusy("community");
    setFeedback(null);
    const res = await fetch(`/api/console/contacts/${contactId}/community`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !communityActive }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy("");
    setFeedback(
      res.ok
        ? { kind: "ok", text: communityActive ? "PRO community access removed." : "PRO community access given." }
        : { kind: "error", text: body.error || "Could not change community access." },
    );
    if (res.ok) router.refresh();
  }

  const actions = [
    {
      key: "email",
      label: "Send email",
      hint: emailEligible ? "Write and send one email" : "Unsubscribed or undeliverable",
      disabled: !emailEligible,
      onClick: () => setOpen("email"),
    },
    {
      key: "whatsapp",
      label: "Send WhatsApp",
      hint: !phone ? "No phone number" : whatsappStatus === "unsubscribed" ? "They opted out" : "Send an approved template",
      disabled: whatsappBlocked,
      onClick: () => setOpen("whatsapp"),
    },
    {
      key: "review",
      label: "Request Google review",
      hint: !hasGoogleReviewLink ? "Save the review link in Reviews first" : "Email or WhatsApp",
      disabled: !emailEligible || !hasGoogleReviewLink || busy === "review",
      onClick: () => setOpen("review"),
    },
    {
      key: "course",
      label: "Give course access",
      hint: hasAccount ? "Free or PRO" : "Creates an account for them",
      disabled: courses.length === 0,
      onClick: () => setOpen("course"),
    },
    {
      key: "community",
      label: communityActive ? "Remove community access" : "Give community access",
      hint: hasAccount ? "Site-wide PRO community" : "Needs an account first",
      disabled: !hasAccount || busy === "community",
      onClick: toggleCommunity,
    },
  ];

  return (
    <section className="rounded-2xl border border-line bg-paper p-6">
      {dialog}
      <h2 className="font-display text-lg font-semibold">Actions</h2>
      <p className="mt-1 text-sm text-ink-soft">Everything you can do for this contact. Nothing here sends without asking first.</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            className="rounded-xl border border-line px-4 py-3 text-left transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line"
          >
            <span className="block text-sm font-medium">{busy === action.key ? "Working…" : action.label}</span>
            <span className="mt-0.5 block text-xs text-ink-soft">{action.hint}</span>
          </button>
        ))}

        {whatsappMessageCount > 0 && (
          <Link
            href={`/console/whatsapp/messages/c-${contactId}`}
            className="rounded-xl border border-line px-4 py-3 text-left transition-colors hover:border-ink"
          >
            <span className="block text-sm font-medium">Open WhatsApp chat</span>
            <span className="mt-0.5 block text-xs text-ink-soft">
              {whatsappMessageCount} message{whatsappMessageCount === 1 ? "" : "s"}
            </span>
          </Link>
        )}
      </div>

      {feedback && (
        <p className={`mt-3 text-sm ${feedback.kind === "error" ? "text-red-600" : "text-green-700"}`}>{feedback.text}</p>
      )}

      {open === "email" && (
        <SendEmailModal contactId={contactId} email={email} replyToEmail={replyToEmail} onClose={() => setOpen(null)} />
      )}
      {open === "whatsapp" && (
        <ConsoleModal title={`WhatsApp ${name || phone || "this contact"}`} onClose={() => setOpen(null)} wide>
          <ContactWhatsAppSend
            contactId={contactId}
            phone={phone}
            whatsappStatus={whatsappStatus}
            onSent={() => router.refresh()}
          />
        </ConsoleModal>
      )}
      {open === "review" && (
        <ConsoleModal title="Request a Google review" onClose={() => setOpen(null)}>
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">Choose how to ask {name || email} for a review. The request goes out immediately.</p>
            <button
              type="button"
              onClick={() => sendReview("email")}
              disabled={!emailEligible || !hasGoogleReviewLink || busy === "review"}
              className="flex w-full items-center justify-between rounded-xl border border-line px-4 py-3 text-left transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>
                <span className="block text-sm font-medium">Email template</span>
                <span className="mt-0.5 block text-xs text-ink-soft">google-review-request</span>
              </span>
              <span className="text-xs text-ink-soft">{!emailEligible ? "Unsubscribed or undeliverable" : ""}</span>
            </button>
            <button
              type="button"
              onClick={() => sendReview("whatsapp")}
              disabled={!phone || whatsappStatus === "unsubscribed" || !hasGoogleReviewLink || busy === "review"}
              className="flex w-full items-center justify-between rounded-xl border border-line px-4 py-3 text-left transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>
                <span className="block text-sm font-medium">WhatsApp template</span>
                <span className="mt-0.5 block text-xs text-ink-soft">customer_review_request</span>
              </span>
              <span className="text-xs text-ink-soft">{!phone ? "No phone number" : whatsappStatus === "unsubscribed" ? "They opted out" : ""}</span>
            </button>
          </div>
        </ConsoleModal>
      )}
      {open === "course" && (
        <ConsoleModal title="Give course access" onClose={() => setOpen(null)}>
          <ContactGrantCourse contactId={contactId} hasAccount={hasAccount} courses={courses} />
        </ConsoleModal>
      )}
    </section>
  );
}

function SendEmailModal({
  contactId,
  email,
  replyToEmail,
  onClose,
}: {
  contactId: number;
  email: string;
  replyToEmail: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"custom" | "template">("custom");
  const [templates, setTemplates] = useState<EmailContentTemplate[] | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [from, setFrom] = useState(SENDER_ADDRESSES[0].value as string);
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduledEmails, setScheduledEmails] = useState<{ id: number; subject: string; at: string }[]>([]);
  const senderOptions = useMemo(() => SENDER_ADDRESSES.map((s) => ({ value: s.value, label: s.label })), []);

  useEffect(() => {
    if (mode !== "template" || templates !== null) return;
    fetch("/api/console/email/content-templates")
      .then((res) => res.json())
      .then((data) => setTemplates(data.templates || []))
      .catch(() => setTemplates([]));
  }, [mode, templates]);

  useEffect(() => {
    fetch(`/api/console/contacts/${contactId}/send-email`)
      .then((res) => res.json())
      .then((data) => setScheduledEmails((data.scheduledEmails || []).map((item: { id: number; subject: string; scheduled_at: string }) => ({
        id: Number(item.id), subject: item.subject, at: item.scheduled_at,
      }))))
      .catch(() => setScheduledEmails([]));
  }, [contactId]);

  async function submit(scheduleFor?: string): Promise<boolean> {
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/console/contacts/${contactId}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, subject, html, ...(scheduleFor ? { scheduledAt: scheduleFor } : {}) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Email could not be sent.");
      if (body.scheduled) setScheduledEmails((current) => [...current, { id: Number(body.id), at: body.scheduledAt, subject }].sort((a, b) => a.at.localeCompare(b.at)));
      else {
        setSent(true);
        setSubject("");
        setHtml("");
      }
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Email could not be sent.");
      return false;
    } finally {
      setSending(false);
    }
  }

  async function schedule(scheduledAt: string) {
    if (await submit(scheduledAt)) setScheduleModalOpen(false);
  }

  async function cancelScheduled(scheduleId: number) {
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/console/contacts/${contactId}/send-email/scheduled/${scheduleId}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not cancel the scheduled email.");
      setScheduledEmails((current) => current.filter((item) => item.id !== scheduleId));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel the scheduled email.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
    <ConsoleModal title={`Email ${email}`} onClose={onClose} wide open={!scheduleModalOpen}>
      <div className="space-y-4">
        <div className="flex gap-2 rounded-full border border-line bg-paper-soft p-1 text-sm">
          {(["custom", "template"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={`flex-1 rounded-full px-4 py-1.5 font-medium transition-colors ${
                mode === key ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
              }`}
            >
              {key === "custom" ? "Write custom" : "Use a template"}
            </button>
          ))}
        </div>

        {mode === "template" && (
          <div>
            <label className="text-sm font-medium">Template</label>
            <div className="mt-2">
              {templates === null ? (
                <p className="text-sm text-ink-soft">Loading templates…</p>
              ) : templates.length === 0 ? (
                <p className="text-sm text-ink-soft">
                  No templates yet. Create one on the Email → Templates tab.
                </p>
              ) : (
                <BrandSelect
                  value={templateId}
                  placeholder="Pick a template"
                  onChange={(id) => {
                    setTemplateId(id);
                    const template = templates.find((t) => String(t.id) === id);
                    if (!template) return;
                    setSubject(template.subject);
                    setHtml(template.body_html);
                  }}
                  options={templates.map((t) => ({ value: String(t.id), label: t.name }))}
                  wrapOptions
                />
              )}
            </div>
            <p className="mt-1.5 text-xs text-ink-soft">
              Copies its subject and content in, filled with this contact&apos;s own details — still fully editable
              before sending.
            </p>
          </div>
        )}

        <div>
          <label className="text-sm font-medium">From</label>
          <BrandSelect className="mt-2" value={from} onChange={setFrom} options={senderOptions} wrapOptions />
          <p className="mt-1.5 text-xs text-ink-soft">Replies go to {replyToEmail || "your contact email"} whichever you pick.</p>
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="contact-email-subject">Subject</label>
          <input
            id="contact-email-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            className="mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-soft">Insert:</span>
            {TEMPLATE_VARIABLES.map((variable) => (
              <button
                key={variable.token}
                type="button"
                onClick={() => setSubject((current) => `${current}{{${variable.token}}}`)}
                className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-soft transition-colors hover:border-ink"
              >
                {variable.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Message</label>
          <div className="mt-2">
            <RichTextEditor value={html} variables={TEMPLATE_VARIABLES} onChange={setHtml} />
          </div>
        </div>

        {sent && <p className="text-sm text-green-700">Sent to {email}.</p>}
        {scheduledEmails.length > 0 && <div className="space-y-2 rounded-xl border border-line bg-paper-soft p-3 text-sm">
          <p className="font-medium">Scheduled emails</p>
          {scheduledEmails.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-ink-soft">{item.subject} · {formatIndiaDateTime(item.at)} IST</p>
            <button type="button" onClick={() => void cancelScheduled(item.id)} disabled={sending} className="rounded-full border border-line px-3 py-1.5 text-sm font-medium disabled:opacity-50">{sending ? "Working…" : "Cancel"}</button>
          </div>)}
        </div>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-full border border-line px-4 text-sm font-medium transition-colors hover:border-ink"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={sending || !subject.trim() || !html.trim()}
            className="h-10 rounded-full bg-ink px-4 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send email"}
          </button>
          <button
            type="button"
            onClick={() => {
              setError("");
              setScheduleModalOpen(true);
            }}
            disabled={sending || !subject.trim() || !html.trim()}
            className="h-10 rounded-full border border-line px-4 text-sm font-medium transition-colors hover:border-ink disabled:opacity-50"
          >
            Schedule email
          </button>
        </div>
      </div>
    </ConsoleModal>
    {scheduleModalOpen && <ScheduleDateTimeModal
      title="Schedule email"
      actionLabel="Schedule email"
      initialValue=""
      busy={sending}
      error={error}
      onClose={() => setScheduleModalOpen(false)}
      onSchedule={schedule}
    />}
    </>
  );
}
