"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BrandSelect from "@/components/BrandSelect";
import { useConfirm } from "@/components/ConfirmDialog";
import { countryOptions } from "@/lib/countries";
import { DAY_FIELDS, SEGMENT_FIELDS, type SegmentRule, type SegmentRules } from "@/lib/contactSegmentTypes";

type Option = { value: string; label: string };
type Segment = {
  id: number;
  name: string;
  description: string | null;
  rules: SegmentRules;
  is_system: boolean;
  contact_count: number;
  marketable_count: number;
};

function ruleValues(field: string, courses: Option[], campaigns: Option[]): Option[] {
  const definition = SEGMENT_FIELDS.find((item) => item.value === field);
  if (field === "course_enrolled") return courses;
  if (field === "course_tier") return courses.flatMap((course) => [
    { value: `${course.value}:free`, label: `${course.label} — Free` },
    { value: `${course.value}:pro`, label: `${course.label} — PRO` },
  ]);
  if (["campaign_opened", "campaign_not_opened", "campaign_clicked"].includes(field)) return campaigns;
  if (field === "country") return [{ value: "unknown", label: "Unknown" }, ...countryOptions()];
  return (definition?.values || []).map((value) => ({ value, label: value.replace(/_/g, " ") }));
}

function SegmentEditor({
  initial,
  courses,
  campaigns,
  onClose,
}: {
  initial?: Segment;
  courses: Option[];
  campaigns: Option[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [match, setMatch] = useState<"all" | "any">(initial?.rules.match || "all");
  const [rules, setRules] = useState<SegmentRule[]>(initial?.rules.rules || [
    { field: "marketing_status", operator: "equals", value: "subscribed" },
  ]);
  const [preview, setPreview] = useState<number | null>(null);
  const [status, setStatus] = useState("");

  function updateRule(index: number, patch: Partial<SegmentRule>) {
    setRules((current) => current.map((rule, i) => {
      if (i !== index) return rule;
      const next = { ...rule, ...patch };
      if (patch.field) {
        const values = ruleValues(patch.field, courses, campaigns);
        const days = DAY_FIELDS.includes(patch.field);
        next.operator = days ? "within" : "equals";
        next.value = values[0]?.value || (days ? "30" : "");
      }
      return next;
    }));
    setPreview(null);
  }

  async function previewCount() {
    setStatus("Checking audience…");
    const res = await fetch("/api/console/email/segments", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: { match, rules } }),
    });
    const body = await res.json().catch(() => ({}));
    setPreview(res.ok ? body.count : null);
    setStatus(res.ok ? "" : body.error || "Could not preview this segment.");
  }

  async function save() {
    setStatus("Saving…");
    const url = initial ? `/api/console/email/segments/${initial.id}` : "/api/console/email/segments";
    const res = await fetch(url, {
      method: initial ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, rules: { match, rules } }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(body.error || "Could not save this segment.");
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div className="mt-4 space-y-4 border-t border-line pt-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Segment name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-ink" />
        </div>
        <div>
          <label className="text-sm font-medium">Description</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-ink" />
        </div>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <span className="text-ink-soft">A contact must match</span>
        <BrandSelect value={match} onChange={(value) => setMatch(value as "all" | "any")} options={[
          { value: "all", label: "all rules" }, { value: "any", label: "any rule" },
        ]} compact />
      </div>

      <div className="space-y-3">
        {rules.map((rule, index) => {
          const values = ruleValues(rule.field, courses, campaigns);
          const numeric = DAY_FIELDS.includes(rule.field);
          return (
            <div key={index} className="grid gap-3 rounded-xl bg-paper-soft p-3 sm:grid-cols-[1fr_1fr_auto]">
              <BrandSelect
                value={rule.field}
                onChange={(value) => updateRule(index, { field: value })}
                options={SEGMENT_FIELDS.map((field) => ({ value: field.value, label: field.label }))}
                compact
              />
              {values.length > 0 ? (
                <BrandSelect value={rule.value} onChange={(value) => updateRule(index, { value })} options={values} compact />
              ) : (
                <input
                  type={numeric ? "number" : "text"}
                  min={numeric ? 0 : undefined}
                  value={rule.value}
                  onChange={(e) => updateRule(index, { value: e.target.value })}
                  placeholder={numeric ? "30" : "Enter ID"}
                  className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
                />
              )}
              <button type="button" onClick={() => setRules((current) => current.filter((_, i) => i !== index))} className="px-3 text-sm text-red-600">Remove</button>
            </div>
          );
        })}
      </div>

      <button type="button" onClick={() => setRules((current) => [...current, { field: "has_account", operator: "equals", value: "true" }])} className="text-sm font-medium underline">+ Add rule</button>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <button type="button" onClick={save} disabled={!name.trim() || rules.length === 0} className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper disabled:opacity-50">Save segment</button>
        <button type="button" onClick={previewCount} className="rounded-full border border-line px-5 py-2 text-sm font-medium">Preview audience</button>
        <button type="button" onClick={onClose} className="text-sm text-ink-soft">Cancel</button>
        {preview !== null && <p className="text-sm font-medium">{preview} marketable contact{preview === 1 ? "" : "s"}</p>}
        {status && <p className="text-sm text-red-600">{status}</p>}
      </div>
    </div>
  );
}

export default function ConsoleSegments({ segments, courses, campaigns }: { segments: Segment[]; courses: Option[]; campaigns: Option[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const { confirm, dialog } = useConfirm();
  const sorted = useMemo(() => [...segments].sort((a, b) => Number(b.is_system) - Number(a.is_system) || a.name.localeCompare(b.name)), [segments]);

  async function remove(segment: Segment) {
    if (!(await confirm({ message: `Delete the segment "${segment.name}"? Existing campaign snapshots will remain intact.` }))) return;
    const res = await fetch(`/api/console/email/segments/${segment.id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-ink-soft">Saved audiences update automatically from contact identity, consent, purchases, courses, community activity, and email engagement. Campaign recipients are frozen when you press Send.</p>
        <button type="button" onClick={() => setEditingId("new")} className="shrink-0 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper">New segment</button>
      </div>
      {editingId === "new" && <div className="mt-5 rounded-2xl border border-line bg-paper p-5"><SegmentEditor courses={courses} campaigns={campaigns} onClose={() => setEditingId(null)} /></div>}
      <div className="mt-6 space-y-3">
        {sorted.map((segment) => (
          <div key={segment.id} className="rounded-2xl border border-line bg-paper p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2"><p className="font-medium">{segment.name}</p>{segment.is_system && <span className="rounded-full bg-paper-soft px-2 py-0.5 text-xs text-ink-soft">Automatic</span>}</div>
                {segment.description && <p className="mt-1 text-xs text-ink-soft">{segment.description}</p>}
                <p className="mt-2 text-sm"><strong>{segment.contact_count}</strong> contacts · <strong>{segment.marketable_count}</strong> currently sendable</p>
              </div>
              <div className="flex gap-3 text-sm">
                <Link href={`/console/email/segments/${segment.id}`} className="underline">View contacts</Link>
                {!segment.is_system && <button type="button" onClick={() => setEditingId(editingId === segment.id ? null : segment.id)} className="underline">Edit</button>}
                {!segment.is_system && <button type="button" onClick={() => remove(segment)} className="text-red-600 underline">Delete</button>}
              </div>
            </div>
            {editingId === segment.id && <SegmentEditor initial={segment} courses={courses} campaigns={campaigns} onClose={() => setEditingId(null)} />}
          </div>
        ))}
      </div>
      {dialog}
    </div>
  );
}
