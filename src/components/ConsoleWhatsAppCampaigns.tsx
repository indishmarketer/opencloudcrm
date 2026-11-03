"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BrandSelect from "@/components/BrandSelect";
import ConsoleModal from "@/components/ConsoleModal";
import { useConfirm } from "@/components/ConfirmDialog";
import { templateBody, templateVariables, type WhatsAppTemplate } from "@/lib/whatsappTemplateShape";

export type CampaignRow = {
  id: number;
  name: string;
  template_name: string;
  language: string;
  category: string | null;
  status: string;
  variables: string[];
  header_media_url: string | null;
  button_url_param: string | null;
  button_url_index: number | null;
  segment_id: number | null;
  segment_name: string | null;
  recipients: number;
  pending: number;
  sent: number;
  failed: number;
  skipped: number;
  delivered: number;
  read: number;
  created_at: string;
  sent_at: string | null;
  last_error: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sending: "Sending",
  sent: "Sent",
  completed_with_errors: "Sent with errors",
};

export default function ConsoleWhatsAppCampaigns({
  campaigns,
  segments,
  templates,
  reachable,
}: {
  campaigns: CampaignRow[];
  segments: { id: number; name: string }[];
  templates: WhatsAppTemplate[];
  /** Contacts opted in to WhatsApp with a usable number. */
  reachable: number;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [creating, setCreating] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "duplicate" | "edit">("create");
  const [seedCampaign, setSeedCampaign] = useState<CampaignRow | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  async function send(campaign: CampaignRow) {
    const ok = await confirm({
      message: `Send "${campaign.name}" on WhatsApp to everyone in ${campaign.segment_name || "this audience"} who has opted in? This cannot be unsent.`,
      confirmLabel: "Send it",
    });
    if (!ok) return;
    setBusyId(campaign.id);
    setError("");
    setResult("");
    const res = await fetch(`/api/console/whatsapp/campaigns/${campaign.id}/send`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setError(data.error || "Could not start that campaign.");
      return;
    }
    setResult(
      data.message ||
        `Queued ${data.queued} message${data.queued === 1 ? "" : "s"}. ${data.sent} sent now, the rest go out over the next few minutes.`,
    );
    router.refresh();
  }

  async function remove(campaign: CampaignRow) {
    const ok = await confirm({ message: campaign.status === "draft"
      ? `Delete the draft "${campaign.name}"?`
      : `Delete "${campaign.name}" and its campaign recipient/report history? Messages already sent stay in WhatsApp and in the inbox, but campaign-level analytics for this campaign will be removed.` });
    if (!ok) return;
    setBusyId(campaign.id);
    setError("");
    const res = await fetch(`/api/console/whatsapp/campaigns/${campaign.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setError(data.error || "Could not delete that campaign.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      {dialog}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink-soft">
          A campaign sends one approved template to everyone in a saved audience who has opted in to WhatsApp.{" "}
          <strong className="font-medium text-ink">{reachable}</strong> contact{reachable === 1 ? "" : "s"} can be
          reached right now. Messages go out in small batches over a few minutes, which is deliberate: WhatsApp limits
          how many conversations a number can start in a day and scores it on how often people block it.
        </p>
        <button
          type="button"
          onClick={() => { setSeedCampaign(null); setModalMode("create"); setCreating(true); }}
          disabled={templates.length === 0 || segments.length === 0}
          className="shrink-0 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          New campaign
        </button>
      </div>

      {templates.length === 0 && (
        <p className="mt-4 rounded-2xl border border-dashed border-line p-6 text-sm text-ink-soft">
          No approved templates yet. Create one on the Templates tab and wait for Meta to approve it.
        </p>
      )}
      {segments.length === 0 && (
        <p className="mt-4 rounded-2xl border border-dashed border-line p-6 text-sm text-ink-soft">
          No saved audiences yet. Build one under Email → Segments; the same audiences work here.
        </p>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {result && <p className="mt-4 text-sm text-green-700">{result}</p>}

      <div className="mt-6 space-y-3">
        {campaigns.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line p-10 text-center">
            <p className="font-medium">No campaigns yet</p>
            <p className="mt-1 text-sm text-ink-soft">A campaign you create stays a draft until you send it.</p>
          </div>
        ) : (
          campaigns.map((campaign) => (
            <div key={campaign.id} className="rounded-2xl border border-line bg-paper p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{campaign.name}</p>
                    <span className="rounded-full bg-paper-soft px-2.5 py-1 text-xs font-medium text-ink-soft">
                      {STATUS_LABEL[campaign.status] || campaign.status}
                    </span>
                    {campaign.category && (
                      <span className="text-xs text-ink-soft">{campaign.category.toLowerCase()}</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">
                    {campaign.template_name} · {campaign.segment_name || "audience deleted"}
                  </p>
                  {campaign.recipients > 0 && (
                    <p className="mt-2 text-xs text-ink-soft">
                      {campaign.sent} sent · {campaign.delivered} delivered · {campaign.read} read
                      {campaign.pending > 0 && ` · ${campaign.pending} still queued`}
                      {campaign.failed > 0 && ` · ${campaign.failed} failed`}
                      {campaign.skipped > 0 && ` · ${campaign.skipped} skipped`}
                    </p>
                  )}
                  {campaign.last_error && <p className="mt-2 text-xs text-red-600">{campaign.last_error}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                  {campaign.status === "draft" && (
                    <>
                      <button
                        type="button"
                        onClick={() => { setSeedCampaign(campaign); setModalMode("edit"); setCreating(true); }}
                        disabled={busyId === campaign.id}
                        className="rounded-full border border-line px-4 py-2 text-xs font-medium transition-colors hover:border-ink disabled:opacity-50"
                      >Edit</button>
                      <button
                        type="button"
                        onClick={() => send(campaign)}
                        disabled={busyId === campaign.id}
                        className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
                      >
                        {busyId === campaign.id ? "Sending…" : "Send"}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => { setSeedCampaign(campaign); setModalMode("duplicate"); setCreating(true); }}
                    disabled={busyId === campaign.id}
                    className="rounded-full border border-line px-4 py-2 text-xs font-medium transition-colors hover:border-ink disabled:opacity-50"
                  >Duplicate</button>
                  {campaign.status !== "sending" && <button
                    type="button"
                    onClick={() => remove(campaign)}
                    disabled={busyId === campaign.id}
                    className="rounded-full border border-line px-4 py-2 text-xs font-medium text-red-600 transition-colors hover:border-red-400 disabled:opacity-50"
                  >Delete</button>}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {creating && (
        <NewCampaignModal
          mode={modalMode}
          initialCampaign={seedCampaign}
          templates={templates}
          segments={segments}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function NewCampaignModal({
  mode,
  initialCampaign,
  templates,
  segments,
  onClose,
  onSaved,
}: {
  mode: "create" | "duplicate" | "edit";
  initialCampaign: CampaignRow | null;
  templates: WhatsAppTemplate[];
  segments: { id: number; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(() => initialCampaign ? `${initialCampaign.name}${mode === "duplicate" ? " copy" : ""}` : "");
  const [templateName, setTemplateName] = useState(initialCampaign?.template_name || "");
  const [segmentId, setSegmentId] = useState(initialCampaign?.segment_id ? String(initialCampaign.segment_id) : "");
  const [audience, setAudience] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const template = useMemo(() => templates.find((t) => t.name === templateName) || null, [templates, templateName]);
  const vars = useMemo(() => (template ? templateVariables(templateBody(template)) : []), [template]);

  // The count is the campaign's own count, not the segment's: it excludes
  // anyone without consent or without a usable number, which is usually
  // most of a segment built for email.
  useEffect(() => {
    if (!segmentId) return;
    let active = true;
    fetch(`/api/console/whatsapp/campaigns?segmentId=${segmentId}`)
      .then((res) => res.json())
      .then((data) => {
        if (active) setAudience(typeof data.count === "number" ? data.count : null);
      })
      .catch(() => {
        if (active) setAudience(null);
      });
    return () => {
      active = false;
    };
  }, [segmentId]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(
        mode === "edit" && initialCampaign
          ? `/api/console/whatsapp/campaigns/${initialCampaign.id}`
          : "/api/console/whatsapp/campaigns",
        {
          method: mode === "edit" ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            templateName,
            segmentId: Number(segmentId),
            variables: [],
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save this campaign.");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this campaign.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ConsoleModal
      title={mode === "edit" ? "Edit WhatsApp campaign" : mode === "duplicate" ? "Duplicate WhatsApp campaign" : "New WhatsApp campaign"}
      onClose={onClose}
      wide
    >
      <div className="space-y-5">
        <div>
          <label className="text-sm font-medium" htmlFor="campaign-name">Name</label>
          <input
            id="campaign-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            placeholder="October course launch"
            className="mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink"
          />
          <p className="mt-1.5 text-xs text-ink-soft">Only for your own reference. Nobody receiving it sees this.</p>
        </div>

        <div>
          <label className="text-sm font-medium">Template</label>
          <BrandSelect
            className="mt-2"
            value={templateName}
            placeholder="Pick an approved template"
            onChange={(v) => {
              setTemplateName(v);
            }}
            options={templates.map((t) => ({ value: t.name, label: `${t.name} (${t.category.toLowerCase()})` }))}
            wrapOptions
          />
          {template && (
            <p className="mt-2 whitespace-pre-wrap rounded-lg bg-paper-soft p-3 text-sm text-ink-soft">
              {templateBody(template)}
            </p>
          )}
          {template && (
            <p className="mt-2 text-xs text-ink-soft">
              This campaign uses the approved Meta template as-is. To change its wording, edit the template on the Templates tab; Meta may review the change.
            </p>
          )}
          {template?.category === "MARKETING" && (
            <p className="mt-2 text-xs text-ink-soft">
              A marketing template costs more per message and only goes to people who opted in. Give it a reply
              button labelled something like &quot;Unsubscribe&quot; so opting out is one tap.
            </p>
          )}
        </div>

        <div>
          <label className="text-sm font-medium">Audience</label>
          <BrandSelect
            className="mt-2"
            value={segmentId}
            placeholder="Pick a saved audience"
            onChange={(v) => {
              setSegmentId(v);
              setAudience(null);
            }}
            options={segments.map((s) => ({ value: String(s.id), label: s.name }))}
            wrapOptions
          />
          <p className="mt-1.5 text-xs text-ink-soft">
            {audience === null
              ? "The same audiences the email campaigns use."
              : `${audience} ${audience === 1 ? "person has" : "people have"} opted in to WhatsApp in this audience, with a usable number.`}
          </p>
        </div>

        {vars.length > 0 && (
          <p className="rounded-lg bg-paper-soft p-3 text-xs text-ink-soft">Every recipient&apos;s variables are filled from this template&apos;s saved CRM mappings. Set them on the Templates tab. Fixed custom values and internal resources are shared by everyone in this campaign.</p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-line px-5 py-2.5 text-sm font-medium transition-colors hover:border-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={
              saving ||
              !name.trim() ||
              !templateName ||
              !segmentId
            }
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {saving ? "Saving…" : mode === "edit" ? "Save changes" : mode === "duplicate" ? "Create duplicate draft" : "Save as draft"}
          </button>
        </div>
      </div>
    </ConsoleModal>
  );
}
