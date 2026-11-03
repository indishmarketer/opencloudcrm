"use client";

import { useEffect, useMemo, useState } from "react";
import BrandSelect from "@/components/BrandSelect";
import { templateBody, templateVariables, type WhatsAppTemplate } from "@/lib/whatsappTemplateShape";

/** Sends one approved template to a contact. The form only, so it can live
 * inside the Actions modal: the approved-template list comes from Meta's
 * API, so it is fetched when the modal opens rather than on every contact
 * page view. Template variables are resolved from the saved template mapping
 * and this contact's CRM activity, so this form only selects and sends. */
export default function ContactWhatsAppSend({
  contactId,
  phone,
  whatsappStatus,
  onSent,
}: {
  contactId: number;
  phone: string | null;
  whatsappStatus: string;
  onSent?: () => void;
}) {
  const [templates, setTemplates] = useState<WhatsAppTemplate[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const template = useMemo(() => templates?.find((t) => t.name === selected) || null, [templates, selected]);
  const variableCount = template ? templateVariables(templateBody(template)).length : 0;
  const marketingBlocked = template?.category === "MARKETING" && whatsappStatus !== "subscribed";

  useEffect(() => {
    let active = true;
    fetch("/api/console/whatsapp/templates")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not load templates.");
        return data.templates as WhatsAppTemplate[];
      })
      .then((list) => {
        if (!active) return;
        setTemplates(list.filter((t) => t.status === "APPROVED" && t.category !== "AUTHENTICATION"));
        setLoading(false);
      })
      .catch((e) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Could not load templates.");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function send() {
    if (!template) return;
    setSending(true);
    setError("");
    setSent(false);
    try {
      const res = await fetch(`/api/console/contacts/${contactId}/send-whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateName: template.name,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not send that message.");
      setSent(true);
      onSent?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send that message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">
        Goes to {phone || "no number on file"}. Starting a conversation needs an approved template; a free-form reply
        is only possible for 24 hours after their own last message, in the inbox.
      </p>

      {loading && <p className="text-sm text-ink-soft">Loading templates…</p>}

      {templates && templates.length === 0 && (
        <p className="text-sm text-ink-soft">No approved templates yet. Create one on the WhatsApp tab.</p>
      )}

      {templates && templates.length > 0 && (
        <div>
          <label className="text-sm font-medium">Template</label>
          <BrandSelect
            className="mt-2"
            value={selected}
            placeholder="Pick a template"
            wrapOptions
            onChange={(v) => {
              setSelected(v);
              setSent(false);
              setError("");
            }}
            options={templates.map((t) => ({ value: t.name, label: `${t.name} (${t.category.toLowerCase()})` }))}
          />
        </div>
      )}

      {template && (
        <>
          <p className="whitespace-pre-wrap rounded-lg bg-paper-soft p-3 text-sm text-ink-soft">
            {templateBody(template)}
          </p>

          {marketingBlocked && (
            <p className="rounded-lg bg-paper-soft px-3 py-2 text-sm text-amber-700">
              This is a marketing template and this contact has not opted in to WhatsApp, so it cannot be sent.
              Utility templates about something they did are still allowed.
            </p>
          )}

          {variableCount === 0 ? (
            <p className="rounded-lg bg-paper-soft px-3 py-2 text-xs text-ink-soft">This template has no message variables.</p>
          ) : template.variableMappings?.length === variableCount ? (
            <p className="rounded-lg bg-paper-soft px-3 py-2 text-xs text-ink-soft">Template values fill automatically from this contact&apos;s CRM activity and the fixed values saved on the template.</p>
          ) : (
            <p className="rounded-lg bg-paper-soft px-3 py-2 text-xs text-ink-soft">Set the variable mappings in WhatsApp → Templates before sending.</p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={send}
              disabled={
                sending ||
                marketingBlocked
              }
              className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send on WhatsApp"}
            </button>
            {sent && <p className="text-sm text-green-700">Sent. Delivery status appears in the inbox.</p>}
          </div>
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
