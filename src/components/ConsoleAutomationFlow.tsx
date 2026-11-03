"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BrandSelect from "@/components/BrandSelect";
import RichTextEditor from "@/components/RichTextEditor";
import { useConfirm } from "@/components/ConfirmDialog";
import { EMAIL_FLOW_VARIABLES } from "@/lib/messageVariables";
import { emailAt } from "@/config/brand";
import type { EmailContentTemplate } from "@/lib/emailContentTemplates";

const TRIGGERS: Record<string, string> = {
  user_signup_verified: "Someone verifies their email (any new account)",
  course_enroll_free: "Someone enrolls free in a course",
  course_purchase: "Someone buys a PRO course directly",
  course_upgrade_to_pro: "Someone upgrades from free to PRO on a course",
  course_inactivity: "Someone is inactive after enrolling / completing a lesson",
  course_completed: "Someone completes every accessible lesson in a course",
  newsletter_signup: "Someone confirms a newsletter signup",
  community_inactivity: "A community member has not created their first post",
  voice_agent_interest: "Someone shares their email while trying the voice agent",
};

const FROM_ADDRESSES = [
  { value: emailAt("academy"), label: emailAt("academy") },
  { value: emailAt("support"), label: emailAt("support") },
  { value: emailAt("reach"), label: emailAt("reach") },
];

type Step = {
  id: number;
  position: number;
  delay_days: number;
  from_email: string;
  subject: string;
  body_html: string;
  condition_type: "always" | "opened" | "not_opened" | "clicked" | "not_clicked";
  condition_step_id: number | null;
  sent: number;
  opened: number;
  clicked: number;
  action_type: "email" | "google_review_request";
  review_template_key: string | null;
};

type Flow = { id: number; name: string; trigger_key: string; active: boolean; course_id: number | null; course_title: string | null; purpose: "service" | "marketing"; entry_segment_id: number | null; goal_type: string };
type Segment = { id: number; name: string };
type Delivery = { id: number; recipient_email: string; subject: string; status: string; sent_at: string | null; first_opened_at: string | null; first_clicked_at: string | null; position: number };

function StepEditor({ step, earlierSteps, triggerKey, templates, onSaved, onDeleted }: { step: Step; earlierSteps: Step[]; triggerKey: string; templates: EmailContentTemplate[]; onSaved: () => void; onDeleted: () => void }) {
  const [delayDays, setDelayDays] = useState(step.delay_days);
  const [fromEmail, setFromEmail] = useState(step.from_email);
  const [subject, setSubject] = useState(step.subject);
  const [bodyHtml, setBodyHtml] = useState(step.body_html);
  const [conditionType, setConditionType] = useState(step.condition_type);
  const [conditionStepId, setConditionStepId] = useState(step.condition_step_id ? String(step.condition_step_id) : "");
  const [actionType, setActionType] = useState(step.action_type || "email");
  const [reviewTemplateKey, setReviewTemplateKey] = useState(step.review_template_key || "google-review-request");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");
  const [testTo, setTestTo] = useState("");
  const { confirm, dialog } = useConfirm();
  const variables = EMAIL_FLOW_VARIABLES[triggerKey] || EMAIL_FLOW_VARIABLES.user_signup_verified;

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/console/automation/steps/${step.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delayDays, fromEmail, subject, bodyHtml, conditionType, conditionStepId: conditionStepId ? Number(conditionStepId) : null, actionType, reviewTemplateKey }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setTestStatus("error");
      setTestMessage(body.error || "Could not save this email.");
      return;
    }
    setDirty(false);
    onSaved();
  }

  async function sendTest() {
    setTestStatus("sending");
    const res = await fetch(`/api/console/automation/steps/${step.id}/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, bodyHtml, fromEmail, testTo }),
    });
    const body = await res.json().catch(() => ({}));
    setTestStatus(res.ok ? "sent" : "error");
    setTestMessage(res.ok ? `Sent to ${body.sentTo}` : body.error || "Something went wrong.");
    setTimeout(() => setTestStatus("idle"), 6000);
  }

  async function del() {
    if (!(await confirm({ message: "Delete this email from the flow?" }))) return;
    await fetch(`/api/console/automation/steps/${step.id}`, { method: "DELETE" });
    onDeleted();
  }

  return (
    <div className="rounded-2xl border border-line bg-paper p-5">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-ink-soft">Wait</label>
        <input
          type="number"
          min={0}
          value={delayDays}
          onChange={(e) => {
            setDelayDays(Number(e.target.value));
            setDirty(true);
          }}
          className="w-20 rounded-lg border border-line bg-paper px-3 py-1.5 text-sm outline-none focus:border-ink"
        />
        <label className="text-sm text-ink-soft">days, then send from</label>
        <div className="min-w-[220px]">
          <BrandSelect
            value={fromEmail}
            onChange={(v) => {
              setFromEmail(v);
              setDirty(true);
            }}
            options={FROM_ADDRESSES}
            compact
          />
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Action</label>
          <div className="mt-1"><BrandSelect value={actionType} onChange={(value) => { setActionType(value as Step["action_type"]); setDirty(true); }} options={[{ value: "email", label: "Send this email" }, { value: "google_review_request", label: "Send Google review request" }]} /></div>
        </div>
        {actionType === "google_review_request" && <div><label className="text-sm font-medium">Review template</label><div className="mt-1"><BrandSelect value={reviewTemplateKey} onChange={(value) => { setReviewTemplateKey(value); setDirty(true); }} options={[{ value: "google-review-request", label: "Google review request" }, { value: "google-review-reminder", label: "Google review reminder (unclicked only)" }]} /></div></div>}
        <div>
          <label className="text-sm font-medium">Send condition</label>
          <div className="mt-1">
            <BrandSelect value={conditionType} onChange={(value) => { setConditionType(value as Step["condition_type"]); if (value === "always") setConditionStepId(""); setDirty(true); }} options={[
              { value: "always", label: "Always send" },
              ...(earlierSteps.length ? [
                { value: "opened", label: "Only if an earlier email was opened" },
                { value: "not_opened", label: "Only if an earlier email was not opened" },
                { value: "clicked", label: "Only if an earlier email was clicked" },
                { value: "not_clicked", label: "Only if an earlier email was not clicked" },
              ] : []),
            ]} />
          </div>
        </div>
        {conditionType !== "always" && (
          <div>
            <label className="text-sm font-medium">Earlier email to check</label>
            <div className="mt-1">
              <BrandSelect value={conditionStepId} onChange={(value) => { setConditionStepId(value); setDirty(true); }} options={earlierSteps.map((item) => ({ value: String(item.id), label: `Email ${item.position + 1}: ${item.subject}` }))} />
            </div>
          </div>
        )}
      </div>
      {conditionType === "not_opened" && <p className="mt-2 text-xs text-amber-700">Opens are approximate because privacy tools can hide or pre-load them. Click conditions are more reliable.</p>}

      {actionType === "email" && templates.length > 0 && (
        <div className="mt-4 min-w-[260px] max-w-sm">
          <label className="text-sm text-ink-soft">Start from a template</label>
          <div className="mt-1">
            <BrandSelect
              value=""
              placeholder="Pick a template"
              onChange={(id) => {
                const template = templates.find((t) => String(t.id) === id);
                if (!template) return;
                setSubject(template.subject);
                setBodyHtml(template.body_html);
                setDirty(true);
              }}
              options={templates.map((t) => ({ value: String(t.id), label: t.name }))}
              compact
            />
          </div>
          <p className="mt-1 text-xs text-ink-soft">Copies its subject and content in — still fully editable after.</p>
        </div>
      )}

      {actionType === "email" && <div className="mt-4">
        <label className="text-sm font-medium">Subject</label>
        <input
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            setDirty(true);
          }}
          className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-soft">Insert field:</span>
          {variables.map((variable) => (
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
        </div>
      </div>}

      {actionType === "email" && <div className="mt-4">
        <label className="text-sm font-medium">Content</label>
        <div className="mt-1">
          <RichTextEditor
            value={bodyHtml}
            variables={variables}
            onChange={(html) => {
              setBodyHtml(html);
              setDirty(true);
            }}
          />
        </div>
        <p className="mt-1.5 text-xs text-ink-soft">Insert fields above or from the editor toolbar. Available values depend on what started this flow and are filled from that event.</p>
      </div>}
      {actionType === "google_review_request" && <p className="mt-4 rounded-xl bg-paper-soft p-3 text-sm text-ink-soft">Uses the fixed review template and official Google review link. Consent and duplicate protection are rechecked at send time.</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {actionType === "email" && <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {saving ? "Saving..." : dirty ? "Save changes" : "Saved"}
        </button>}
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
          onClick={del}
          className="rounded-full border border-red-600 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
        >
          Delete this email
        </button>
      </div>
      <p className="mt-4 text-xs text-ink-soft">Performance: {step.sent} sent · {step.opened} opened · {step.clicked} clicked</p>
      {dialog}
    </div>
  );
}

export default function ConsoleAutomationFlow({ flow, initialSteps, segments, deliveries, templates }: { flow: Flow; initialSteps: Step[]; segments: Segment[]; deliveries: Delivery[]; templates: EmailContentTemplate[] }) {
  const router = useRouter();
  const [name, setName] = useState(flow.name);
  const [active, setActive] = useState(flow.active);
  const [steps, setSteps] = useState(initialSteps);
  const [nameDirty, setNameDirty] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [purpose, setPurpose] = useState(flow.purpose);
  const [entrySegmentId, setEntrySegmentId] = useState(flow.entry_segment_id ? String(flow.entry_segment_id) : "");
  const [goalType, setGoalType] = useState(flow.goal_type);
  const [settingsStatus, setSettingsStatus] = useState("");
  const { confirm, dialog } = useConfirm();

  async function saveName() {
    await fetch(`/api/console/automation/flows/${flow.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setNameDirty(false);
  }

  async function toggleActive() {
    const next = !active;
    setActive(next);
    const res = await fetch(`/api/console/automation/flows/${flow.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: next }),
    });
    if (!res.ok) { setActive(!next); const body = await res.json().catch(() => ({})); setSettingsStatus(body.error || "Could not change flow status."); }
  }

  async function saveSettings() {
    setSettingsStatus("Saving...");
    const res = await fetch(`/api/console/automation/flows/${flow.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose, entrySegmentId: entrySegmentId ? Number(entrySegmentId) : null, goalType }) });
    setSettingsStatus(res.ok ? "Saved" : "Could not save settings.");
  }

  async function addStep() {
    const res = await fetch(`/api/console/automation/flows/${flow.id}/steps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        delayDays: 0,
        fromEmail: emailAt("academy"),
        subject: "New email",
        bodyHtml: "<p></p>",
        actionType: "email",
      }),
    });
    const body = await res.json();
    setSteps((s) => [
      ...s,
      {
        id: body.id,
        position: s.length,
        delay_days: 0,
        from_email: emailAt("academy"),
        subject: "New email",
        body_html: "<p></p>",
        condition_type: "always",
        condition_step_id: null,
        sent: 0,
        opened: 0,
        clicked: 0,
        action_type: "email",
        review_template_key: null,
      },
    ]);
  }

  async function duplicateFlow() {
    setDuplicating(true);
    const res = await fetch(`/api/console/automation/flows/${flow.id}/duplicate`, { method: "POST" });
    const body = await res.json();
    setDuplicating(false);
    if (res.ok) router.push(`/console/email/automation/${body.id}`);
  }

  async function deleteFlow() {
    const ok = await confirm({
      message: `Delete the flow "${flow.name}"? This deletes all its emails too.`,
    });
    if (!ok) return;
    await fetch(`/api/console/automation/flows/${flow.id}`, { method: "DELETE" });
    router.push("/console/email/automation");
  }

  return (
    <div>
      <Link href="/console/email/automation" className="text-sm text-ink-soft hover:text-ink">
        ← Automation
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameDirty(true);
          }}
          onBlur={() => nameDirty && saveName()}
          className="font-display text-2xl font-semibold sm:text-3xl outline-none"
        />
        <button
          type="button"
          onClick={toggleActive}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            active ? "bg-emerald-100 text-emerald-800" : "bg-paper-soft text-ink-soft"
          }`}
        >
          {active ? "Active" : "Paused"}
        </button>
      </div>
      <p className="mt-2 text-sm text-ink-soft">
        Sends when: {TRIGGERS[flow.trigger_key] || flow.trigger_key}
        {flow.course_title && (
          <>
            {" "}
            for <span className="font-medium text-ink">{flow.course_title}</span>
          </>
        )}
      </p>

      <div className="mt-6 rounded-2xl border border-line bg-paper p-5">
        <h2 className="font-medium">Who enters and when they stop</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium">Purpose</label>
            <div className="mt-1"><BrandSelect value={purpose} onChange={(value) => setPurpose(value as Flow["purpose"])} options={[
              { value: "service", label: "Service / relationship" },
              { value: "marketing", label: "Marketing (consent required)" },
            ]} /></div>
          </div>
          <div>
            <label className="text-sm font-medium">Optional entry segment</label>
            <div className="mt-1"><BrandSelect value={entrySegmentId} onChange={setEntrySegmentId} options={[{ value: "", label: "Everyone who triggers it" }, ...segments.map((segment) => ({ value: String(segment.id), label: segment.name }))]} /></div>
          </div>
          <div>
            <label className="text-sm font-medium">Exit goal</label>
            <div className="mt-1"><BrandSelect value={goalType} onChange={setGoalType} options={[
              { value: "none", label: "No automatic exit goal" },
              ...(flow.course_id ? [
                { value: "course_pro", label: "Stop after PRO access" },
                { value: "course_completed", label: "Stop after course completion" },
              ] : []),
              { value: "community_first_post", label: "Stop after first community post" },
            ]} /></div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={saveSettings} className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink">Save journey settings</button>
          {settingsStatus && <span className="text-xs text-ink-soft">{settingsStatus}</span>}
        </div>
      </div>

      <div className="mt-8 space-y-6">
        {steps.map((s, index) => (
          <StepEditor
            key={s.id}
            step={s}
            earlierSteps={steps.slice(0, index)}
            triggerKey={flow.trigger_key}
            templates={templates}
            onSaved={() => {}}
            onDeleted={() => setSteps((prev) => prev.filter((x) => x.id !== s.id))}
          />
        ))}
      </div>

      <h2 className="mt-12 font-display text-xl font-semibold">Recipients and behavior</h2>
      <p className="mt-1 text-sm text-ink-soft">The latest 100 real deliveries for this flow. Clicks are the strongest engagement signal; opens are approximate.</p>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-paper">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-ink-soft"><tr><th className="px-4 py-3 font-medium">Contact</th><th className="px-4 py-3 font-medium">Email step</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Opened</th><th className="px-4 py-3 font-medium">Clicked</th></tr></thead>
          <tbody>
            {deliveries.map((delivery) => <tr key={delivery.id} className="border-b border-line last:border-0"><td className="px-4 py-3">{delivery.recipient_email}</td><td className="px-4 py-3">{delivery.position + 1}: {delivery.subject}</td><td className="px-4 py-3">{delivery.status}</td><td className="px-4 py-3">{delivery.first_opened_at ? "Yes" : "No"}</td><td className="px-4 py-3">{delivery.first_clicked_at ? "Yes" : "No"}</td></tr>)}
            {!deliveries.length && <tr><td colSpan={5} className="px-4 py-3 text-ink-soft">No real sends from this flow yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={addStep}
          className="rounded-full border border-line px-5 py-2.5 text-sm font-medium transition-colors hover:border-ink"
        >
          + Add an email to this flow
        </button>
        <button
          type="button"
          onClick={duplicateFlow}
          disabled={duplicating}
          className="rounded-full border border-line px-5 py-2.5 text-sm font-medium transition-colors hover:border-ink disabled:opacity-50"
        >
          {duplicating ? "Duplicating..." : "Duplicate this flow"}
        </button>
      </div>

      <div className="mt-12 border-t border-line pt-6">
        <button
          type="button"
          onClick={deleteFlow}
          className="rounded-full border border-red-600 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
        >
          Delete this entire flow
        </button>
      </div>
      {dialog}
    </div>
  );
}
