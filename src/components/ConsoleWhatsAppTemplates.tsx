"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AnchoredPopover from "@/components/AnchoredPopover";
import ConsoleModal from "@/components/ConsoleModal";
import BrandSelect from "@/components/BrandSelect";
import WhatsAppVariableSourcePicker from "@/components/WhatsAppVariableSourcePicker";
import { useConfirm } from "@/components/ConfirmDialog";
import { SITE_NAME, SITE_URL } from "@/config/brand";
import type { WhatsAppVariableMapping, WhatsAppVariableSource } from "@/lib/whatsappVariableMappings";
import {
  dynamicUrlButtonIndex,
  MEDIA_PARAM_TYPE,
  templateBody,
  templateButtons,
  templateExampleValues,
  templateHeaderMedia,
  templateVariables,
  validateTemplateDraft,
  type HeaderFormat,
  type MediaFormat,
  type TemplateButton,
  type TemplateCategory,
  type WhatsAppTemplate,
} from "@/lib/whatsappTemplateShape";

const MEDIA_ACCEPT: Record<MediaFormat, string> = {
  IMAGE: "image/jpeg,image/png",
  VIDEO: "video/mp4",
  DOCUMENT: "application/pdf",
};

const MEDIA_HINT: Record<MediaFormat, string> = {
  IMAGE: "JPEG or PNG, up to 5MB.",
  VIDEO: "MP4, up to 16MB.",
  DOCUMENT: "PDF, up to 16MB.",
};

const STATUS_STYLES: Record<string, string> = {
  APPROVED: "bg-green-100 text-green-800",
  PENDING: "bg-amber-100 text-amber-800",
  IN_APPEAL: "bg-amber-100 text-amber-800",
  REJECTED: "bg-red-100 text-red-700",
  PAUSED: "bg-red-100 text-red-700",
  DISABLED: "bg-red-100 text-red-700",
};

const CATEGORY_HELP: Record<TemplateCategory, string> = {
  UTILITY: "Follows something the person did: an order, a booking, an account change. Cheapest, approved fastest.",
  MARKETING: "Promotions, offers, newsletters. Costs more per message and people can opt out of it.",
  AUTHENTICATION: "One-time passcodes only. Not for anything else.",
};

/** Left blank by default since every deployment's WhatsApp number is
 * different -- the owner types their own number once and it's just a
 * normal controlled field after that. */
const TEST_RECIPIENT = "";

/** Suggestions only: the owner can type anything. These exist so the first
 * few templates get grouped consistently instead of each one inventing its
 * own wording for the same thing. */
const LABEL_SUGGESTIONS = ["Bookings", "Courses", "Payments", "Newsletter", "Promotions", "Support", "Account phone verification"];

/** The same rules the server checks, run while typing so a problem shows up
 * before the submit instead of after Meta refuses it. Runs the real
 * validator rather than a copy of its rules -- the copy that used to live
 * here drifted the moment buttons were added -- but stays quiet until there
 * is enough typed in to judge. */
function draftProblem(name: string, body: string, samples: string[], buttons: TemplateButton[]): string | null {
  if (!name.trim() || !body.trim()) return null;
  const vars = templateVariables(body);
  if (samples.some((s, i) => i < vars.length && !s.trim())) return "Every variable needs an example value.";
  return validateTemplateDraft({ name, body, samples: vars.map((_, i) => samples[i] || ""), buttons });
}

/** How the editor modal was opened: a blank template, an edit of an
 * existing one (same name, resubmitted for review), or a copy of one as a
 * new name. */
type EditorMode =
  | { kind: "create" }
  | { kind: "edit"; template: WhatsAppTemplate }
  | { kind: "copy"; template: WhatsAppTemplate };

export default function ConsoleWhatsAppTemplates({
  templates,
  variableSources = [],
  mediaUrls = {},
  groups = {},
  sendsFrom = {},
}: {
  templates: WhatsAppTemplate[];
  variableSources?: WhatsAppVariableSource[];
  mediaUrls?: Record<string, string>;
  /** Which groups each template is in; Meta has no concept of them. */
  groups?: Record<string, string[]>;
  /** The number each template category goes out from, already resolved. */
  sendsFrom?: Record<string, string | null>;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [tab, setTab] = useState<"all" | "groups">("all");
  const [editor, setEditor] = useState<EditorMode | null>(null);
  const [testing, setTesting] = useState<WhatsAppTemplate | null>(null);
  const [viewing, setViewing] = useState<WhatsAppTemplate | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  // Every group in use, so the picker offers what exists before asking for
  // anything new. Case-insensitively unique: two spellings of the same word
  // are one group to anyone reading the list.
  const groupNames = useMemo(() => {
    const seen = new Map<string, string>();
    for (const list of Object.values(groups)) {
      for (const name of list) if (!seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
    }
    return [...seen.values()].sort((x, y) => x.localeCompare(y));
  }, [groups]);

  const matching = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return templates.filter((template) => {
      if (category && template.category !== category) return false;
      if (status && template.status !== status) return false;
      if (!needle) return true;
      // Searches the message text too, not just the name: a template is
      // easier to find by what it says than by what it was called.
      return (
        template.name.toLowerCase().includes(needle) ||
        templateBody(template).toLowerCase().includes(needle) ||
        (groups[template.name] || []).some((g) => g.toLowerCase().includes(needle))
      );
    });
  }, [templates, search, category, status, groups]);

  const filtersApplied = Boolean(search.trim() || category || status);
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
  const visible = matching.slice((Math.min(page, pageCount) - 1) * pageSize, Math.min(page, pageCount) * pageSize);

  async function remove(template: WhatsAppTemplate) {
    const ok = await confirm({
      message: `Delete the template "${template.name}"? Anything in the site that sends it will stop working until a replacement is approved.`,
    });
    if (!ok) return;
    setError("");
    const res = await fetch(`/api/console/whatsapp/templates?name=${encodeURIComponent(template.name)}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Could not delete that template.");
      return;
    }
    setViewing(null);
    router.refresh();
  }

  const rowProps: RowProps = {
    groups,
    groupNames,
    onView: setViewing,
    onTest: setTesting,
    onEdit: (template: WhatsAppTemplate) => setEditor({ kind: "edit", template }),
    onCopy: (template: WhatsAppTemplate) => setEditor({ kind: "copy", template }),
    onDelete: remove,
  };

  return (
    <div>
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink-soft">
          Message templates are the only way to start a WhatsApp conversation with someone. Meta reviews each one,
          which usually takes a few minutes.
        </p>
        <button
          type="button"
          onClick={() => setEditor({ kind: "create" })}
          className="shrink-0 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80"
        >
          New template
        </button>
      </div>
      {/* Groups are ours, not Meta's, so they get their own view rather than
          a chip on every row -- a template in three groups would push three
          of them into a list where only the name and status matter. */}
      <div className="mt-6 flex gap-1 rounded-full border border-line p-1 text-sm font-medium sm:w-fit">
        {([["all", `All templates (${templates.length})`], ["groups", `Groups (${groupNames.length})`]] as const).map(([key, text]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-current={tab === key ? "page" : undefined}
            className={`flex-1 rounded-full px-4 py-2 transition-colors sm:flex-none ${
              tab === key ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
            }`}
          >
            {text}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {tab === "groups" ? (
        <TemplateGroupsTab templates={templates} groups={groups} groupNames={groupNames} rowProps={rowProps} />
      ) : (
        <>
          {templates.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="tpl-search">Search templates</label>
              <input
                id="tpl-search"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search name or message"
                className="min-w-[14rem] flex-1 rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
              />
              <BrandSelect
                compact
                value={category}
                placeholder="Any category"
                onChange={(value) => { setCategory(value); setPage(1); }}
                options={[
                  { value: "", label: "Any category" },
                  { value: "UTILITY", label: "Utility" },
                  { value: "MARKETING", label: "Marketing" },
                  { value: "AUTHENTICATION", label: "Authentication" },
                ]}
              />
              <BrandSelect
                compact
                value={status}
                placeholder="Any status"
                onChange={(value) => { setStatus(value); setPage(1); }}
                options={[
                  { value: "", label: "Any status" },
                  { value: "APPROVED", label: "Approved" },
                  { value: "PENDING", label: "In review" },
                  { value: "REJECTED", label: "Rejected" },
                  { value: "PAUSED", label: "Paused" },
                  { value: "DISABLED", label: "Disabled" },
                ]}
              />
              {filtersApplied && (
                <button
                  type="button"
                  onClick={() => { setSearch(""); setCategory(""); setStatus(""); setPage(1); }}
                  className="rounded-full border border-line px-4 py-2 text-xs font-medium transition-colors hover:border-ink"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          <div className="mt-6 space-y-3">
            {templates.length === 0 && (
              <div className="rounded-2xl border border-dashed border-line p-10 text-center">
                <p className="font-medium">No templates yet</p>
                <p className="mt-1 text-sm text-ink-soft">Create one to start sending WhatsApp messages.</p>
              </div>
            )}
            {templates.length > 0 && matching.length === 0 && (
              <div className="rounded-2xl border border-dashed border-line p-10 text-center">
                <p className="font-medium">Nothing matches</p>
                <p className="mt-1 text-sm text-ink-soft">Clear the filters to see all {templates.length} templates.</p>
              </div>
            )}
            {visible.map((template) => <TemplateRow key={template.id} template={template} {...rowProps} />)}
          </div>

          {matching.length > pageSize && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="text-xs text-ink-soft">
                Showing {(Math.min(page, pageCount) - 1) * pageSize + 1}–{Math.min(page, pageCount) * pageSize} of {matching.length} templates
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                  className="rounded-full border border-line px-4 py-2 text-xs font-medium disabled:opacity-40"
                >Previous</button>
                <span className="self-center text-xs text-ink-soft">Page {Math.min(page, pageCount)} of {pageCount}</span>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                  disabled={page >= pageCount}
                  className="rounded-full border border-line px-4 py-2 text-xs font-medium disabled:opacity-40"
                >Next</button>
              </div>
            </div>
          )}
        </>
      )}

      {editor && (
        <TemplateEditorModal
          mode={editor}
          variableSources={variableSources}
          mediaUrl={editor.kind === "create" ? undefined : mediaUrls[editor.template.name]}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            router.refresh();
          }}
        />
      )}
      {viewing && (
        <TemplateViewModal
          template={viewing}
          mediaUrl={mediaUrls[viewing.name]}
          groups={groups[viewing.name] || []}
          sendsFrom={sendsFrom[viewing.category] || null}
          onClose={() => setViewing(null)}
          onEdit={() => { const selected = viewing; setViewing(null); setEditor({ kind: "edit", template: selected }); }}
          onDelete={() => remove(viewing)}
        />
      )}
      {testing && <TestSendModal template={testing} mediaUrl={mediaUrls[testing.name]} onClose={() => setTesting(null)} />}
    </div>
  );
}

type RowProps = {
  groups: Record<string, string[]>;
  groupNames: string[];
  onView: (template: WhatsAppTemplate) => void;
  onTest: (template: WhatsAppTemplate) => void;
  onEdit: (template: WhatsAppTemplate) => void;
  onCopy: (template: WhatsAppTemplate) => void;
  onDelete: (template: WhatsAppTemplate) => void;
};

/** One template in a list: what it is on the left, what can be done with it
 * on the right. Its groups are deliberately not printed here -- they live on
 * the Groups tab, and a template can be in several. */
function TemplateRow({ template, groups, groupNames, onView, onTest, onEdit, onCopy, onDelete }: { template: WhatsAppTemplate } & RowProps) {
  const button = "rounded-full border border-line px-4 py-2 text-xs font-medium transition-colors hover:border-ink";
  return (
    <div className="rounded-2xl border border-line bg-paper p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{template.name}</p>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                STATUS_STYLES[template.status] || "bg-paper-soft text-ink-soft"
              }`}
            >
              {template.status === "APPROVED" ? "Approved" : template.status.toLowerCase().replace(/_/g, " ")}
            </span>
            <span className="text-xs text-ink-soft">
              {template.category.toLowerCase()} · {template.language}
            </span>
          </div>
          {template.rejected_reason && template.status === "REJECTED" && (
            <p className="mt-2 text-xs text-red-600">Meta&apos;s reason: {template.rejected_reason}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 xl:justify-end">
          <TemplateGroupPicker name={template.name} memberOf={groups[template.name] || []} groupNames={groupNames} />
          <button type="button" onClick={() => onView(template)} className={button}>View</button>
          {template.status === "APPROVED" && (
            <button type="button" onClick={() => onTest(template)} className={button}>Send test</button>
          )}
          {/* Offered in every state, including PENDING: Meta's own dashboard
              allows editing a template that is still in review, and a
              refusal now surfaces its real reason. */}
          <button type="button" onClick={() => onEdit(template)} className={button}>Edit</button>
          <button type="button" onClick={() => onCopy(template)} className={button}>Copy</button>
          <button
            type="button"
            onClick={() => onDelete(template)}
            className="rounded-full border border-line px-4 py-2 text-xs font-medium text-red-600 transition-colors hover:border-red-400"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/** The Groups tab: one row per group, opening to the templates inside it.
 * A group holds nothing of its own beyond its name -- it exists because
 * templates point at it -- so removing a group removes the grouping and
 * leaves every template exactly where it was. */
function TemplateGroupsTab({ templates, groups, groupNames, rowProps }: {
  templates: WhatsAppTemplate[];
  groups: Record<string, string[]>;
  groupNames: string[];
  rowProps: RowProps;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [open, setOpen] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const members = (group: string) =>
    templates.filter((t) => (groups[t.name] || []).some((g) => g.toLowerCase() === group.toLowerCase()));
  const ungrouped = templates.filter((t) => (groups[t.name] || []).length === 0);

  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const res = await fetch("/api/console/whatsapp/templates/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not change that group.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function removeGroup(group: string) {
    const ok = await confirm({
      message: `Remove the group "${group}"? The templates in it stay exactly as they are, they just stop being grouped.`,
      confirmLabel: "Remove group",
    });
    if (!ok) return;
    if (await post({ action: "delete", group })) setOpen(null);
  }

  return (
    <div className="mt-6 space-y-3">
      {dialog}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {groupNames.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center">
          <p className="font-medium">No groups yet</p>
          <p className="mt-1 text-sm text-ink-soft">
            Open All templates and use Groups on any row to put it in one. A template can be in several.
          </p>
        </div>
      )}

      {groupNames.map((group) => {
        const inside = members(group);
        const expanded = open?.toLowerCase() === group.toLowerCase();
        return (
          <div key={group} className="rounded-2xl border border-line bg-paper">
            <div className="flex flex-wrap items-center gap-3 p-5">
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : group)}
                aria-expanded={expanded}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span aria-hidden="true" className={`text-xs text-ink-soft transition-transform ${expanded ? "rotate-90" : ""}`}>
                  &#9654;
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{group}</span>
                  <span className="mt-0.5 block text-xs text-ink-soft">
                    {inside.length} template{inside.length === 1 ? "" : "s"}
                  </span>
                </span>
              </button>
              {renaming === group ? (
                <span className="flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`rename-group-${group}`}>New name for {group}</label>
                  <input
                    id={`rename-group-${group}`}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    maxLength={40}
                    className="w-40 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
                  />
                  <button
                    type="button"
                    disabled={busy || !draft.trim()}
                    onClick={async () => {
                      if (await post({ action: "rename", group, to: draft.trim() })) {
                        setRenaming(null);
                        setOpen(null);
                      }
                    }}
                    className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper disabled:opacity-50"
                  >
                    {busy ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRenaming(null); setError(""); }}
                    className="rounded-full border border-line px-4 py-2 text-xs font-medium hover:border-ink"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <span className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setRenaming(group); setDraft(group); setError(""); }}
                    className="rounded-full border border-line px-4 py-2 text-xs font-medium transition-colors hover:border-ink"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => removeGroup(group)}
                    className="rounded-full border border-line px-4 py-2 text-xs font-medium text-red-600 transition-colors hover:border-red-400"
                  >
                    Remove group
                  </button>
                </span>
              )}
            </div>
            {expanded && (
              <div className="space-y-3 border-t border-line p-5">
                {inside.length === 0 ? (
                  <p className="text-sm text-ink-soft">Nothing in this group.</p>
                ) : (
                  inside.map((template) => <TemplateRow key={template.id} template={template} {...rowProps} />)
                )}
              </div>
            )}
          </div>
        );
      })}

      {groupNames.length > 0 && ungrouped.length > 0 && (
        <p className="pt-1 text-xs text-ink-soft">
          {ungrouped.length} template{ungrouped.length === 1 ? " is" : "s are"} in no group yet.
        </p>
      )}
    </div>
  );
}

/** Puts one template in or out of groups. Opens as the groups that already
 * exist with a tick against the ones this template is in, so the usual case
 * is one click and no group gets a second spelling; typing is only needed
 * for a group that does not exist yet. */
function TemplateGroupPicker({ name, memberOf, groupNames }: { name: string; memberOf: string[]; groupNames: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // AnchoredPopover handles click-outside and Escape itself, and positions
  // the panel against the trigger so the last row in the list does not open
  // its menu below the fold.
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const isMember = (group: string) => memberOf.some((g) => g.toLowerCase() === group.toLowerCase());
  const offered = [
    ...groupNames,
    ...LABEL_SUGGESTIONS.filter((s) => !groupNames.some((g) => g.toLowerCase() === s.toLowerCase())),
  ];

  async function set(group: string, member: boolean) {
    setBusy(group);
    setError("");
    const res = await fetch("/api/console/whatsapp/templates/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "membership", name, group, member }),
    });
    setBusy("");
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not save that group.");
      return;
    }
    setDraft("");
    router.refresh();
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="rounded-full border border-line px-4 py-2 text-xs font-medium text-ink-soft transition-colors hover:border-ink hover:text-ink"
      >
        Groups{memberOf.length ? ` (${memberOf.length})` : ""}
      </button>
      <AnchoredPopover anchor={trigger} open={open} onClose={close} width={288} className="p-3">
        <div>
          <p className="px-1 pb-2 text-xs font-medium text-ink">Groups for this template</p>
          <div className="space-y-0.5">
            {offered.map((group) => {
              const member = isMember(group);
              return (
                <button
                  key={group}
                  type="button"
                  disabled={busy === group}
                  onClick={() => set(group, !member)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-paper-soft disabled:opacity-50"
                >
                  <span aria-hidden="true" className={member ? "text-ink" : "text-line"}>{member ? "✓" : "○"}</span>
                  <span className="min-w-0 flex-1 truncate">{group}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex gap-2 border-t border-line pt-3">
            <label className="sr-only" htmlFor={`new-group-${name}`}>New group for {name}</label>
            <input
              id={`new-group-${name}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={40}
              placeholder="New group"
              className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
            />
            <button
              type="button"
              disabled={Boolean(busy) || !draft.trim()}
              onClick={() => set(draft.trim(), true)}
              className="shrink-0 self-center rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-paper disabled:opacity-50"
            >
              Add
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      </AnchoredPopover>
    </>
  );
}

function TemplateViewModal({ template, mediaUrl, groups, sendsFrom, onClose, onEdit, onDelete }: {
  template: WhatsAppTemplate; mediaUrl?: string; groups: string[]; sendsFrom: string | null;
  onClose: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const header = template.components.find((c) => c.type === "HEADER");
  const footer = template.components.find((c) => c.type === "FOOTER")?.text;
  const buttons = templateButtons(template);
  const media = templateHeaderMedia(template);
  return <ConsoleModal
    title={template.name}
    onClose={onClose}
    wide
    meta={<>
      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[template.status] || "bg-paper-soft text-ink-soft"}`}>
        {template.status === "APPROVED" ? "Approved" : template.status.toLowerCase().replace(/_/g, " ")}
      </span>
      <span className="text-xs text-ink-soft">{template.category.toLowerCase()} · {template.language}</span>
      {groups.length > 0 && <span className="text-xs text-ink-soft">· {groups.join(", ")}</span>}
    </>}
    actions={<div className="flex items-center gap-2">
      <button type="button" onClick={onEdit} className="rounded-full border border-line px-4 py-2 text-xs font-medium hover:border-ink">Edit</button>
      <button type="button" onClick={onDelete} className="rounded-full border border-red-300 px-4 py-2 text-xs font-medium text-red-600 hover:border-red-500">Delete</button>
    </div>}
  >
    {template.rejected_reason && template.status === "REJECTED" && (
      <p className="text-sm text-red-600">Meta&apos;s reason: {template.rejected_reason}</p>
    )}
    <div className="mx-auto max-w-lg rounded-2xl bg-[#e9e4dc] p-4 sm:p-6">
      <div className="rounded-2xl bg-white p-4 text-sm text-ink shadow-sm">
        {media && (media === "IMAGE" && mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- mediaUrl is a short-lived signed URL from Meta's own media CDN, not a fixed host for next.config.ts's remotePatterns allowlist
          <img src={mediaUrl} alt={`${template.name} image header sample`} className="mb-3 max-h-72 w-full rounded-xl object-cover" />
        ) : (
          <div className="mb-3 rounded-xl bg-paper-soft p-8 text-center text-xs text-ink-soft">{media.toLowerCase()} header</div>
        ))}
        {header?.format === "TEXT" && header.text && <p className="mb-2 font-semibold">{header.text}</p>}
        <p className="whitespace-pre-wrap">{templateBody(template)}</p>
        {footer && <p className="mt-2 text-xs text-ink-soft">{footer}</p>}
        {buttons.length > 0 && <div className="mt-3 space-y-2 border-t border-line pt-3">{buttons.map((button, index) => <div key={index} className="text-center text-sm text-blue-700">{button.type === "OTP" ? button.text || "Copy code" : button.text}</div>)}</div>}
      </div>
    </div>
    {sendsFrom && (
      <p className="mt-4 text-center text-xs text-ink-soft">
        Goes out from {sendsFrom} · change on the Numbers tab
      </p>
    )}
  </ConsoleModal>;
}

/** Reads a template back into the form fields, for edit and copy. */
function initialState(template: WhatsAppTemplate | null) {
  const header = template?.components.find((c) => c.type === "HEADER");
  const bodyComponent = template?.components.find((c) => c.type === "BODY");
  const bodyExample = (bodyComponent?.example as { body_text?: string[][] } | undefined)?.body_text?.[0] || [];
  return {
    body: bodyComponent?.text || "",
    footer: template?.components.find((c) => c.type === "FOOTER")?.text || "",
    samples: bodyExample,
    headerFormat: (header?.format as HeaderFormat | undefined) || "NONE",
    headerText: header?.format === "TEXT" ? header.text || "" : "",
    buttons: template ? templateButtons(template) : [],
    addSecurityRecommendation: bodyComponent?.add_security_recommendation ?? true,
    codeExpirationMinutes: template?.components.find((c) => c.type === "FOOTER")?.code_expiration_minutes ?? 10,
  };
}

function TemplateEditorModal({
  mode,
  variableSources,
  mediaUrl,
  onClose,
  onSaved,
}: {
  mode: EditorMode;
  variableSources: WhatsAppVariableSource[];
  mediaUrl?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const source = mode.kind === "create" ? null : mode.template;
  const initial = useMemo(() => initialState(source), [source]);

  const initialName = mode.kind === "edit" ? source!.name : mode.kind === "copy" ? `${source!.name}_v2` : "";
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState<TemplateCategory>(source?.category || "UTILITY");
  const [body, setBody] = useState(initial.body);
  const [footer, setFooter] = useState(initial.footer);
  const [samples, setSamples] = useState<string[]>(() => {
    const list = [...initial.samples];
    const initialVars = templateVariables(initial.body);
    const existingMappings = source?.variableMappings || [];
    initialVars.forEach((pos, idx) => {
      if (!list[idx]?.trim()) {
        const m = existingMappings.find((item) => item.position === pos);
        if (m) {
          if (m.sourceKey === "custom" && m.fixedValue) {
            list[idx] = m.fixedValue;
          } else if (m.sourceKey) {
            const found = variableSources.find((s) => s.key === m.sourceKey);
            if (found?.exampleValue || found?.value) {
              list[idx] = (found.exampleValue || found.value)!;
            }
          }
        }
      }
    });
    return list;
  });
  const [mappings, setMappings] = useState<WhatsAppVariableMapping[]>(source?.variableMappings || []);
  const [headerFormat, setHeaderFormat] = useState<HeaderFormat>(initial.headerFormat);
  const [headerText, setHeaderText] = useState(initial.headerText);
  const [buttons, setButtons] = useState<TemplateButton[]>(initial.buttons);
  const [addSecurityRecommendation, setAddSecurityRecommendation] = useState(initial.addSecurityRecommendation);
  const [codeExpirationMinutes, _setCodeExpirationMinutes] = useState<number | null>(initial.codeExpirationMinutes);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const { confirm, dialog } = useConfirm();

  const vars = useMemo(() => templateVariables(body), [body]);
  const initialMappings = source?.variableMappings || [];
  const hasUnsavedChanges = name !== initialName || category !== (source?.category || "UTILITY") ||
    body !== initial.body || footer !== initial.footer || JSON.stringify(samples) !== JSON.stringify(initial.samples) ||
    JSON.stringify([...mappings].sort((a, b) => a.position - b.position)) !== JSON.stringify([...initialMappings].sort((a, b) => a.position - b.position)) ||
    headerFormat !== initial.headerFormat || headerText !== initial.headerText || JSON.stringify(buttons) !== JSON.stringify(initial.buttons) ||
    addSecurityRecommendation !== initial.addSecurityRecommendation || codeExpirationMinutes !== initial.codeExpirationMinutes || mediaFile !== null;
  const existingContentUnchanged = mode.kind === "edit" &&
    body.trim() === initial.body && footer === initial.footer && JSON.stringify(samples) === JSON.stringify(initial.samples) &&
    headerFormat === initial.headerFormat && headerText === initial.headerText && JSON.stringify(buttons) === JSON.stringify(initial.buttons) &&
    addSecurityRecommendation === initial.addSecurityRecommendation && codeExpirationMinutes === initial.codeExpirationMinutes;
  const problem = category === "AUTHENTICATION"
    ? !name.trim() || /^[a-z0-9_]{1,512}$/.test(name.trim()) ? null : "Name can only use lowercase letters, numbers and underscores."
    : draftProblem(name, body, samples, buttons);

  function setSample(index: number, value: string) {
    setSamples((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
  }

  function autofillAllExamples() {
    setSamples((current) => {
      const next = [...current];
      vars.forEach((position, i) => {
        const mapping = mappings.find((item) => item.position === position);
        if (!mapping) return;
        if (mapping.sourceKey === "custom") {
          if (mapping.fixedValue) next[i] = mapping.fixedValue;
        } else if (mapping.sourceKey) {
          const src = variableSources.find((s) => s.key === mapping.sourceKey);
          const example = src?.exampleValue || src?.value;
          if (example) next[i] = example;
        }
      });
      return next;
    });
  }

  function updateButton(index: number, patch: Partial<TemplateButton>) {
    setButtons((current) =>
      current.map((button, i) => (i === index ? ({ ...button, ...patch } as TemplateButton) : button)),
    );
  }

  const isMediaHeader = headerFormat !== "NONE" && headerFormat !== "TEXT";
  // Meta never gives back the handle of a template's existing sample, so
  // there is nothing to reuse: any submission with a media header has to
  // carry a freshly uploaded file, edits included.
  const needsMediaFile = isMediaHeader && !mediaFile && !existingContentUnchanged;

  async function requestClose() {
    if (saving) return;
    if (hasUnsavedChanges) {
      const discard = await confirm({ message: "Discard your unsaved template changes?", confirmLabel: "Discard changes" });
      if (!discard) return;
    }
    onClose();
  }

  function insertVariable() {
    const field = messageRef.current;
    const start = field?.selectionStart ?? body.length;
    const end = field?.selectionEnd ?? body.length;
    const used = new Set(templateVariables(body));
    let position = 1;
    while (used.has(position)) position++;
    const token = `{{${position}}}`;
    setBody(`${body.slice(0, start)}${token}${body.slice(end)}`);
    requestAnimationFrame(() => {
      const current = messageRef.current;
      if (!current) return;
      const cursor = start + token.length;
      current.focus();
      current.setSelectionRange(cursor, cursor);
    });
  }

  async function submit() {
    setSaving(true);
    setError("");
    try {
      // The media sample goes to Meta first: the template references the
      // handle that upload returns, so it has to exist before we submit.
      let headerMedia: { format: MediaFormat; handle: string; url?: string } | undefined;
      if (category !== "AUTHENTICATION" && isMediaHeader && mediaFile) {
        const form = new FormData();
        form.append("file", mediaFile);
        const upload = await fetch("/api/console/whatsapp/media", { method: "POST", body: form });
        const uploaded = await upload.json().catch(() => ({}));
        if (!upload.ok) throw new Error(uploaded.error || "Could not upload that file.");
        headerMedia = { format: headerFormat as MediaFormat, handle: uploaded.handle, url: uploaded.url };
      }
      if (category !== "AUTHENTICATION" && isMediaHeader && !headerMedia) {
        throw new Error("Choose a file for the header.");
      }

      const editing = mode.kind === "edit";
      const resolvedSamples = vars.map((position, i) => {
        const currentVal = samples[i]?.trim();
        if (currentVal) return currentVal;
        const mapping = mappings.find((item) => item.position === position);
        if (mapping?.sourceKey === "custom") return mapping.fixedValue?.trim() || "";
        if (mapping?.sourceKey) {
          const src = variableSources.find((s) => s.key === mapping.sourceKey);
          return src?.exampleValue || src?.value || "";
        }
        return "";
      });

      const res = await fetch("/api/console/whatsapp/templates", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editing ? { id: mode.template.id, category } : { category, language: "en" }),
          ...(editing ? { mappingOnly: existingContentUnchanged && !mediaFile } : {}),
          name: name.trim(),
          ...(category === "AUTHENTICATION"
            ? {
                authentication: {
                  addSecurityRecommendation,
                  codeExpirationMinutes,
                },
              }
            : {
                body: body.trim(),
                samples: resolvedSamples,
                variableMappings: vars.map((position) => mappings.find((item) => item.position === position) || { position, sourceKey: "" }),
                ...(headerFormat === "TEXT" && headerText.trim() ? { header: headerText.trim() } : {}),
                ...(headerMedia ? { headerMedia } : {}),
                ...(footer.trim() ? { footer: footer.trim() } : {}),
                ...(buttons.length ? { buttons } : {}),
              }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save this template.");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this template.");
    } finally {
      setSaving(false);
    }
  }

  const editing = mode.kind === "edit";

  return (
    <>
    <ConsoleModal
      title={editing ? `Edit ${source!.name}` : mode.kind === "copy" ? `Copy of ${source!.name}` : "New message template"}
      onClose={requestClose}
      wide
    >
      <div className="space-y-5">
        {editing && (
          <p className="rounded-lg border border-line bg-paper-soft p-3 text-xs text-ink-soft">
            Saving sends this back to Meta for review. The current version keeps sending until the new one is
            approved.
          </p>
        )}

        <div>
          <label className="text-sm font-medium" htmlFor="tpl-name">Name</label>
          <input
            id="tpl-name"
            value={name}
            disabled={editing}
            onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
            placeholder="booking_reminder"
            className="mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink disabled:opacity-60"
          />
          <p className="mt-1.5 text-xs text-ink-soft">
            {editing
              ? "A template's name can't change. Use Copy if you need a different one."
              : "Lowercase, numbers and underscores. This is what the code refers to."}
          </p>
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="tpl-category">Category</label>
          <BrandSelect
            className="mt-2"
            value={category}
            disabled={editing}
            onChange={(v) => setCategory(v as TemplateCategory)}
            options={[
              { value: "UTILITY", label: "Utility" },
              { value: "MARKETING", label: "Marketing" },
              { value: "AUTHENTICATION", label: "Authentication" },
            ]}
          />
          <p className="mt-1.5 text-xs text-ink-soft">{CATEGORY_HELP[category]}</p>
        </div>

        {category === "AUTHENTICATION" ? (
          <div className="space-y-4 rounded-xl border border-line bg-paper-soft p-5">
            <div>
              <p className="font-medium">One-time verification code (OTP)</p>
              <p className="mt-1 text-xs text-ink-soft">
                Meta requires standardized wording for all Authentication messages to prevent phishing. Custom text or headers cannot be added.
              </p>
            </div>
            <div className="rounded-2xl bg-[#e9e4dc] p-4 sm:p-5">
              <div className="rounded-xl bg-white p-4 shadow-sm text-sm text-ink space-y-2">
                <p>
                  <strong className="font-semibold text-ink">123456</strong> is your verification code.
                </p>
                {addSecurityRecommendation && (
                  <p className="text-xs text-ink-soft">For your security, do not share this code.</p>
                )}
                <p className="text-xs text-ink-soft">Expires in 10 minutes.</p>
                <div className="mt-3 border-t border-line pt-3 text-center text-sm font-medium text-blue-700">
                  Copy code
                </div>
              </div>
            </div>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={addSecurityRecommendation}
                onChange={(event) => setAddSecurityRecommendation(event.target.checked)}
                className="mt-0.5 accent-black"
              />
              <span>Add Meta&apos;s security reminder (&quot;For your security, do not share this code&quot;)</span>
            </label>
            <p className="text-xs text-ink-soft">
              When sent, your server replaces <strong>123456</strong> with a fresh 6-digit code. Tapping &quot;Copy code&quot; copies it straight to the clipboard.
            </p>
          </div>
        ) : (
          <>
        <div>
          <label className="text-sm font-medium" htmlFor="tpl-header">Header (optional)</label>
          <BrandSelect
            className="mt-2"
            value={headerFormat}
            onChange={(v) => {
              setHeaderFormat(v as HeaderFormat);
              setMediaFile(null);
            }}
            options={[
              { value: "NONE", label: "None" },
              { value: "TEXT", label: "Text" },
              { value: "IMAGE", label: "Image" },
              { value: "VIDEO", label: "Video" },
              { value: "DOCUMENT", label: "Document (PDF)" },
            ]}
          />
          {headerFormat === "TEXT" && (
            <input
              value={headerText}
              onChange={(e) => setHeaderText(e.target.value)}
              maxLength={60}
              placeholder="Your booking is confirmed"
              className="mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink"
            />
          )}
          {isMediaHeader && (
            <div className="mt-2">
              <input
                type="file"
                accept={MEDIA_ACCEPT[headerFormat as MediaFormat]}
                onChange={(e) => setMediaFile(e.target.files?.[0] || null)}
                className="w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-1.5 file:text-xs file:font-medium file:text-paper"
              />
              <p className="mt-1.5 text-xs text-ink-soft">
                {MEDIA_HINT[headerFormat as MediaFormat]} Meta reviews this file, and it also becomes the one your
                messages send unless the code passes a different URL.
                {mediaUrl && !mediaFile && " Choose the file again to resubmit: Meta never hands back the old one."}
              </p>
              {mediaUrl && !mediaFile && (
                <a
                  href={mediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-xs text-ink underline"
                >
                  View the current file
                </a>
              )}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm font-medium" htmlFor="tpl-body">Message</label>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={insertVariable}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-ink hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
              Insert Variable
            </button>
          </div>
          <textarea
            ref={messageRef}
            id="tpl-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            placeholder="Hi, your booking is confirmed. See you then."
            className="mt-2 block w-full resize-y rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink"
          />
          <p className="mt-1.5 text-xs text-ink-soft">
            Place your cursor in the message and insert a variable. The next available number is added at that position.
            Add words before and after it; Meta does not allow a message to start or end with a variable.
          </p>
        </div>

        {vars.length > 0 && (
          <div className="rounded-xl border border-line p-4">
            <p className="font-medium">Dynamic attribute mapping</p>
            <p className="mt-1 text-xs text-ink-soft">Choose each placeholder&apos;s source once here. Contact and activity fields fill per recipient; selected site content and custom values stay fixed on this template.</p>
            <div className="mt-3 space-y-3">
              {vars.map((position) => {
                const mapping = mappings.find((item) => item.position === position);
                return (
                  <div key={position} className="grid gap-2 sm:grid-cols-[4rem_minmax(0,1fr)] sm:items-center">
                    <span className="text-xs font-medium text-ink-soft">{`{{${position}}}`}</span>
                    <div className="space-y-2">
                      <WhatsAppVariableSourcePicker
                        value={mapping?.sourceKey || ""}
                        sources={variableSources}
                        onChange={(selected) => {
                          setMappings((current) => [
                            ...current.filter((item) => item.position !== position),
                            ...(selected ? [{ position, sourceKey: selected.key, fixedValue: selected.value || "" }] : []),
                          ]);
                          if (selected) {
                            const exampleVal = selected.exampleValue || selected.value || "";
                            if (exampleVal) {
                              setSample(position - 1, exampleVal);
                            }
                          }
                        }}
                      />
                      {mapping?.sourceKey === "custom" && (
                        <input
                          value={mapping.fixedValue || ""}
                          onChange={(event) => {
                            const val = event.target.value;
                            setMappings((current) => current.map((item) => item.position === position ? { ...item, fixedValue: val } : item));
                            setSample(position - 1, val);
                          }}
                          maxLength={500}
                          placeholder="Fixed text or URL saved with this template"
                          className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink"
                        />
                      )}
                      {mapping?.sourceKey === "custom" && <p className="text-xs text-ink-soft">Text placeholders can send text or links. To send a PDF/image/video, use a media header.</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {vars.length > 0 && (
          <div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Example values</p>
                <p className="mt-1 text-xs text-ink-soft">Pre-filled from your mapped sources for Meta review. You can adjust any example if needed.</p>
              </div>
              <button
                type="button"
                onClick={autofillAllExamples}
                className="text-xs font-medium text-ink underline transition-colors hover:text-ink-soft"
              >
                Auto-fill from mappings
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {vars.map((v, i) => (
                <div key={v} className="flex items-center gap-3">
                  <span className="w-12 shrink-0 text-xs text-ink-soft">{`{{${v}}}`}</span>
                  <input
                    value={samples[i] || ""}
                    onChange={(e) => setSample(i, e.target.value)}
                    placeholder="Realistic example for Meta review"
                    className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="text-sm font-medium" htmlFor="tpl-footer">Footer text (optional)</label>
          <input
            id="tpl-footer"
            value={footer}
            onChange={(e) => setFooter(e.target.value)}
            maxLength={60}
            placeholder={SITE_NAME}
            className="mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink"
          />
        </div>

        <div>
          <p className="text-sm font-medium">Buttons (optional)</p>
          <p className="mt-1 text-xs text-ink-soft">
            Up to 10. A reply button messages you back with its own label, which is the easiest way to let someone
            opt out of promotions. A link button can carry one value at the end of its URL. One call button, two link
            buttons at most, and reply buttons have to sit together.
          </p>

          <div className="mt-3 space-y-3">
            {buttons.map((button, index) => (
              <div key={index} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-ink-soft">
                    {button.type === "QUICK_REPLY" ? "Reply button" : button.type === "URL" ? "Link button" : "Call button"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setButtons((current) => current.filter((_, i) => i !== index))}
                    className="text-xs text-red-600 underline"
                  >
                    Remove
                  </button>
                </div>
                <input
                  value={button.text}
                  onChange={(e) => updateButton(index, { text: e.target.value })}
                  maxLength={25}
                  placeholder="Button label"
                  className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
                />
                {button.type === "URL" && (
                  <>
                    <input
                      value={button.url}
                      onChange={(e) => updateButton(index, { url: e.target.value })}
                      placeholder={`${SITE_URL}/courses`}
                      className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
                    />
                    {/\{\{\d+\}\}/.test(button.url) && (
                      <input
                        value={button.example?.[0] || ""}
                        onChange={(e) => updateButton(index, { example: [e.target.value] })}
                        placeholder={`${SITE_URL}/courses/ai-agency`}
                        className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
                      />
                    )}
                    <p className="mt-1.5 text-xs text-ink-soft">
                      End the URL with <code className="rounded bg-paper-soft px-1">{"{{1}}"}</code> to fill the rest
                      in per send, then give Meta an example of the finished link.
                    </p>
                  </>
                )}
                {button.type === "PHONE_NUMBER" && (
                  <input
                    value={button.phone_number}
                    onChange={(e) => updateButton(index, { phone_number: e.target.value })}
                    placeholder="15551234567"
                    className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
                  />
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setButtons((current) => [...current, { type: "QUICK_REPLY", text: "" }])}
              className="rounded-full border border-line px-4 py-2 text-xs font-medium transition-colors hover:border-ink"
            >
              Add reply button
            </button>
            <button
              type="button"
              onClick={() => setButtons((current) => [...current, { type: "URL", text: "", url: "https://" }])}
              className="rounded-full border border-line px-4 py-2 text-xs font-medium transition-colors hover:border-ink"
            >
              Add link button
            </button>
            <button
              type="button"
              onClick={() => setButtons((current) => [...current, { type: "PHONE_NUMBER", text: "", phone_number: "" }])}
              className="rounded-full border border-line px-4 py-2 text-xs font-medium transition-colors hover:border-ink"
            >
              Add call button
            </button>
          </div>
        </div>
          </>
        )}

        {problem && <p className="text-sm text-amber-700">{problem}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={requestClose}
            className="rounded-full border border-line px-5 py-2.5 text-sm font-medium transition-colors hover:border-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || !!problem || !name.trim() || (category !== "AUTHENTICATION" && !body.trim()) || (category !== "AUTHENTICATION" && needsMediaFile)}
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {saving ? "Submitting…" : editing ? "Save and resubmit" : "Submit for review"}
          </button>
        </div>
      </div>
    </ConsoleModal>
    {dialog}
    </>
  );
}

function TestSendModal({
  template,
  mediaUrl: storedMediaUrl,
  onClose,
}: {
  template: WhatsAppTemplate;
  mediaUrl?: string;
  onClose: () => void;
}) {
  const vars = useMemo(() => templateVariables(templateBody(template)), [template]);
  const isAuthentication = template.category === "AUTHENTICATION";
  const mediaFormat = useMemo(() => templateHeaderMedia(template), [template]);
  const buttonIndex = useMemo(() => dynamicUrlButtonIndex(template), [template]);
  // Prefilled so a test is one click. Both are editable: clear the number
  // to send somewhere else, and the values are Meta's own examples for this
  // template rather than placeholders, so the message reads like the real
  // thing to whoever receives it.
  const [to, setTo] = useState(TEST_RECIPIENT);
  const [values, setValues] = useState<string[]>(() => templateExampleValues(template));
  const [mediaUrl, setMediaUrl] = useState(storedMediaUrl || "");
  const [buttonValue, setButtonValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function send() {
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/console/whatsapp/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          templateName: template.name,
          language: template.language,
          variables: vars.map((_, i) => values[i] || `Example ${i + 1}`),
          ...(mediaFormat ? { headerMedia: { type: MEDIA_PARAM_TYPE[mediaFormat], link: mediaUrl.trim() } } : {}),
          ...(buttonIndex !== null && buttonValue.trim()
            ? { urlButton: { index: buttonIndex, value: buttonValue.trim() } }
            : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not send the test message.");
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the test message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <ConsoleModal title={`Send a test of ${template.name}`} onClose={onClose}>
      <div className="space-y-5">
        <div>
          <label className="text-sm font-medium" htmlFor="test-to">Send to</label>
          <input
            id="test-to"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="919876543210"
            className="mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink"
          />
          <p className="mt-1.5 text-xs text-ink-soft">Full number including country code, no plus sign.</p>
        </div>

        {isAuthentication && (
          <p className="rounded-lg border border-line bg-paper-soft p-3 text-sm text-ink-soft">
            The console will generate a temporary test code and send it using this template&apos;s Copy code button.
          </p>
        )}

        {mediaFormat && (
          <div>
            <label className="text-sm font-medium" htmlFor="test-media">
              {mediaFormat === "IMAGE" ? "Image" : mediaFormat === "VIDEO" ? "Video" : "Document"} URL
            </label>
            <input
              id="test-media"
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              placeholder={`${SITE_URL}/...`}
              className="mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink"
            />
            <p className="mt-1.5 text-xs text-ink-soft">
              This template has a {mediaFormat.toLowerCase()} header, so every send supplies its own file. The URL has
              to be public for WhatsApp to fetch it.
            </p>
          </div>
        )}

        {!isAuthentication && vars.map((v, i) => (
          <div key={v} className="flex items-center gap-3">
            <span className="w-12 shrink-0 text-xs text-ink-soft">{`{{${v}}}`}</span>
            <input
              value={values[i] || ""}
              onChange={(e) =>
                setValues((current) => {
                  const next = [...current];
                  next[i] = e.target.value;
                  return next;
                })
              }
              placeholder={`Example ${i + 1}`}
              className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
            />
          </div>
        ))}

        {buttonIndex !== null && (
          <div>
            <label className="text-sm font-medium" htmlFor="test-button">Link button value</label>
            <input
              id="test-button"
              value={buttonValue}
              onChange={(e) => setButtonValue(e.target.value)}
              placeholder="ai-agency"
              className="mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink"
            />
            <p className="mt-1.5 text-xs text-ink-soft">Added to the end of this template&apos;s link button URL.</p>
          </div>
        )}

        {sent && <p className="text-sm text-green-700">Sent. Check the phone, then look at the Messages tab for delivery status.</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-line px-5 py-2.5 text-sm font-medium transition-colors hover:border-ink"
          >
            Close
          </button>
          <button
            type="button"
            onClick={send}
            disabled={
              sending ||
              !to.trim() ||
              (!!mediaFormat && !mediaUrl.trim()) ||
              (buttonIndex !== null && !buttonValue.trim())
            }
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send test"}
          </button>
        </div>
      </div>
    </ConsoleModal>
  );
}
