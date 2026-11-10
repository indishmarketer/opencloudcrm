"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useConfirm } from "@/components/ConfirmDialog";
import BrandSelect from "@/components/BrandSelect";
import BrandDatePicker from "@/components/BrandDatePicker";
import { formatDay as formatTimestamp } from "@/lib/formatDate";

type Course = { id: number; title: string };

const PAGE_SIZES = [10, 20, 50, 100];

const SOURCES = [
  { value: "has_account", label: "Account" },
  { value: "has_course", label: "Course" },
  { value: "has_pro_access", label: "PRO access" },
  { value: "has_community", label: "Community member" },
  { value: "has_newsletter", label: "Newsletter" },
  { value: "has_contact", label: "Contact form" },
  { value: "has_product_lead", label: "Product lead" },
  { value: "has_author_application", label: "Author" },
  { value: "has_tool_submission", label: "Tool submitter" },
  { value: "has_webhook_lead", label: "Webhook lead" },
] as const;

type Filters = {
  account: "" | "account" | "guest";
  source: string;
  course: string;
  tier: "" | "free" | "pro";
  marketing: string;
  health: "" | "ok" | "problem";
  added: string;
  opened: string;
  clicked: string;
  site: string;
};

/** Date-based filters: a preset window, a custom range, or never. */
const DATE_KEYS = ["added", "opened", "clicked", "site"] as const;
type DateKey = (typeof DATE_KEYS)[number];
type DateRange = { from: string; to: string };
const EMPTY_RANGES: Record<DateKey, DateRange> = {
  added: { from: "", to: "" },
  opened: { from: "", to: "" },
  clicked: { from: "", to: "" },
  site: { from: "", to: "" },
};

function activityOptions() {
  return [
    { value: "", label: "Any time" },
    { value: "7", label: "Last 7 days" },
    { value: "30", label: "Last 30 days" },
    { value: "90", label: "Last 90 days" },
    { value: "custom", label: "Custom dates" },
    { value: "not30", label: "Not in the last 30 days" },
    { value: "never", label: "Never" },
  ];
}

/** YYYY-MM-DD in the viewer's local time, matching the India-time days the server sends. */
function localDay(ms: number): string {
  return new Date(ms).toLocaleDateString("en-CA");
}

// `days` is typed as an array everywhere, but it is whatever a hand-written
// SELECT produced -- see the note on the "Last activity" cell below. An
// activity filter running over a caller that omitted the column should
// treat it as no activity, not throw.
function matchesDays(input: string[] | undefined, filter: string, range: DateRange, now: number): boolean {
  if (!filter) return true;
  const days = input ?? [];
  if (filter === "never") return days.length === 0;
  if (filter === "custom") {
    return days.some((d) => (!range.from || d >= range.from) && (!range.to || d <= range.to));
  }
  if (filter === "not30") {
    const cutoff = localDay(now - 30 * 86400000);
    return !days.some((d) => d >= cutoff);
  }
  const cutoff = localDay(now - Number(filter) * 86400000);
  return days.some((d) => d >= cutoff);
}

/** A `YYYY-MM-DD` activity day, not a timestamp -- hence the local parse
 * and the "Never" rather than the shared helper's em dash. The locale is
 * pinned for the same reason as `lib/formatDate.ts`: this renders once on
 * the server and again in the browser, and an unpinned locale makes those
 * two disagree. */
function formatDay(day: string | undefined): string {
  if (!day) return "Never";
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const EMPTY_FILTERS: Filters = {
  account: "",
  source: "",
  course: "",
  tier: "",
  marketing: "",
  health: "",
  added: "",
  opened: "",
  clicked: "",
  site: "",
};

type ContactRow = {
  contact_id: number;
  user_id: number | null;
  email: string;
  name: string | null;
  phone: string | null;
  first_seen: string;
  has_contact: boolean;
  has_newsletter: boolean;
  has_product_lead: boolean;
  has_account: boolean;
  has_course: boolean;
  has_community: boolean;
  has_pro_access: boolean;
  /** "courseId:tier" per enrollment. */
  enrollments: string[];
  has_author_application: boolean;
  has_tool_submission: boolean;
  has_webhook_lead: boolean;
  /** Distinct source slugs (the URL segment used in the inbound webhook) that registered this contact as a lead. */
  webhook_lead_sources: string[];
  form_sources: string[];
  marketing_status: string;
  deliverability_status: string;
  /** India-time days (YYYY-MM-DD, newest first) with an email open or click, a click, or a signed-in visit. */
  open_days: string[];
  click_days: string[];
  site_days: string[];
};

type SelectFilterKey = Exclude<keyof Filters, "account">;

/** Dropdown filters shown in the Filter panel, in display order. */
function FILTER_FIELDS(
  courses: Course[]
): { key: SelectFilterKey; label: string; options: { value: string; label: string }[] }[] {
  return [
    { key: "source", label: "Source", options: [{ value: "", label: "Any source" }, ...SOURCES.map((s) => ({ value: s.value, label: s.label }))] },
    {
      key: "course",
      label: "Course",
      options: [
        { value: "", label: "Any course" },
        { value: "none", label: "No course" },
        ...courses.map((c) => ({ value: String(c.id), label: c.title })),
      ],
    },
    {
      key: "tier",
      label: "Course tier",
      options: [
        { value: "", label: "Any tier" },
        { value: "free", label: "Free" },
        { value: "pro", label: "PRO" },
      ],
    },
    {
      key: "marketing",
      label: "Newsletter",
      options: [
        { value: "", label: "Any status" },
        { value: "subscribed", label: "Subscribed" },
        { value: "pending", label: "Pending confirmation" },
        { value: "unsubscribed", label: "Unsubscribed" },
        { value: "unknown", label: "Never subscribed" },
      ],
    },
    {
      key: "health",
      label: "Email health",
      options: [
        { value: "", label: "Any" },
        { value: "ok", label: "Deliverable" },
        { value: "problem", label: "Bounced / blocked" },
      ],
    },
    {
      key: "added",
      label: "Date added",
      options: [
        { value: "", label: "Any time" },
        { value: "7", label: "Last 7 days" },
        { value: "30", label: "Last 30 days" },
        { value: "90", label: "Last 90 days" },
        { value: "custom", label: "Custom dates" },
      ],
    },
    { key: "opened", label: "Opened an email", options: activityOptions() },
    { key: "clicked", label: "Clicked an email", options: activityOptions() },
    { key: "site", label: "Active on the website", options: activityOptions() },
  ];
}

/** Removable summary chips for the filters that are set. */
function activeFilterChips(
  filters: Filters,
  courses: Course[],
  ranges: Record<DateKey, DateRange>
): { key: keyof Filters; label: string }[] {
  const chips: { key: keyof Filters; label: string }[] = [];
  if (filters.account) chips.push({ key: "account", label: filters.account === "account" ? "Has account" : "Guest only" });
  for (const field of FILTER_FIELDS(courses)) {
    const value = filters[field.key];
    if (!value) continue;
    const option = field.options.find((o) => o.value === value);
    let valueLabel = option?.label ?? value;
    if (value === "custom" && isDateKey(field.key)) {
      const range = ranges[field.key];
      valueLabel = `${range.from ? formatDay(range.from) : "start"} to ${range.to ? formatDay(range.to) : "today"}`;
    }
    chips.push({ key: field.key, label: `${field.label}: ${valueLabel}` });
  }
  return chips;
}

function isDateKey(key: string): key is DateKey {
  return (DATE_KEYS as readonly string[]).includes(key);
}

const LIST_STATE_KEY = "console-contacts-list";

/** Search, filters and page as a query string: read from a link's own
 * params or from the copy saved in sessionStorage. */
function readListState(params: URLSearchParams) {
  const filters = { ...EMPTY_FILTERS };
  for (const key of Object.keys(EMPTY_FILTERS) as (keyof Filters)[]) {
    const value = params.get(key);
    if (value) (filters as Record<string, string>)[key] = value;
  }
  // Keep a saved contacts view useful after removing the retired waitlist source.
  if (filters.source === "has_open_source") filters.source = "has_webhook_lead";
  const ranges = { ...EMPTY_RANGES };
  for (const key of DATE_KEYS) {
    ranges[key] = { from: params.get(`${key}_from`) || "", to: params.get(`${key}_to`) || "" };
  }
  const size = Number(params.get("size"));
  return {
    q: params.get("q") || "",
    filters,
    ranges,
    pageSize: PAGE_SIZES.includes(size) ? size : 10,
    page: Math.max(0, (Number(params.get("page")) || 1) - 1),
  };
}

function writeListState(state: ReturnType<typeof readListState>): string {
  const params = new URLSearchParams();
  if (state.q.trim()) params.set("q", state.q.trim());
  for (const [key, value] of Object.entries(state.filters)) if (value) params.set(key, value);
  for (const key of DATE_KEYS) {
    if (state.filters[key] !== "custom") continue;
    if (state.ranges[key].from) params.set(`${key}_from`, state.ranges[key].from);
    if (state.ranges[key].to) params.set(`${key}_to`, state.ranges[key].to);
  }
  if (state.pageSize !== 10) params.set("size", String(state.pageSize));
  if (state.page > 0) params.set("page", String(state.page + 1));
  return params.toString();
}

function contactKey(row: ContactRow): string {
  return `c-${row.contact_id}`;
}

function SourceTags({ row }: { row: ContactRow }) {
  const tags: string[] = [];
  if (row.has_account) tags.push("Account");
  if (row.has_contact) tags.push("Contact form");
  if (row.has_newsletter) tags.push("Newsletter");
  if (row.has_product_lead) tags.push("Product lead");
  if (row.has_course) tags.push("Course");
  if (row.has_community) tags.push("Community");
  if (row.has_author_application) tags.push("Author");
  if (row.has_tool_submission) tags.push("Tool submitter");
  for (const source of row.webhook_lead_sources || []) {
    const label = source === "open-cloud-crm"
      ? "OpenCloud"
      : source.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
    if (!tags.includes(label)) tags.push(label);
  }
  for (const source of row.form_sources || []) {
    if (!tags.includes(source)) tags.push(source);
  }
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t} className="whitespace-nowrap rounded-full border border-line px-2 py-0.5 text-xs text-ink-soft">
          {t}
        </span>
      ))}
    </div>
  );
}

const noopSubscribe = () => () => {};

function readSavedListState(): string {
  try {
    return sessionStorage.getItem(LIST_STATE_KEY) || "";
  } catch {
    return ""; // Storage blocked (private mode etc.): start unfiltered.
  }
}

/** Search, filters and page are kept in sessionStorage (this tab only), so
 * opening a contact and coming back keeps the filtered list. Not in the URL:
 * rewriting it with history.replaceState broke Back in the Next router. The
 * server render can't see storage, so the list mounts once more after
 * hydration with the saved state. A link's own params (?opened=7) win. */
export default function ContactsList(props: { rows: ContactRow[]; courses: Course[] }) {
  const searchParams = useSearchParams();
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const linkQuery = searchParams.toString();
  const initialQuery = linkQuery || (hydrated ? readSavedListState() : "");
  return <ContactsListInner key={hydrated ? "client" : "server"} initialQuery={initialQuery} canSave={hydrated} {...props} />;
}

function ContactsListInner({
  rows,
  courses,
  initialQuery,
  canSave,
}: {
  rows: ContactRow[];
  courses: Course[];
  initialQuery: string;
  canSave: boolean;
}) {
  const [initial] = useState(() => readListState(new URLSearchParams(initialQuery)));
  const [q, setQ] = useState(initial.q);
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [ranges, setRanges] = useState<Record<DateKey, DateRange>>(initial.ranges);
  const [pageSize, setPageSize] = useState(initial.pageSize);
  const [page, setPage] = useState(initial.page);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Taken once on mount; date filters don't need to tick live.
  const [now] = useState(() => Date.now());
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState("");
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  // Only the after-hydration mount saves: the first (server-matching) mount
  // starts from defaults and would overwrite the saved state.
  useEffect(() => {
    if (!canSave) return;
    try {
      sessionStorage.setItem(LIST_STATE_KEY, writeListState({ q, filters, ranges, pageSize, page }));
    } catch {
      // Storage blocked: filters just won't survive navigation.
    }
  }, [canSave, q, filters, ranges, pageSize, page]);

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0);
  }
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const courseId = filters.course && filters.course !== "none" ? filters.course : "";
    return rows.filter((r) => {
      if (filters.account === "account" && !r.has_account) return false;
      if (filters.account === "guest" && r.has_account) return false;
      if (filters.source && !r[filters.source as (typeof SOURCES)[number]["value"]]) return false;
      if (filters.course === "none" && r.enrollments.length > 0) return false;
      if (courseId || filters.tier) {
        const match = r.enrollments.some((e) => {
          const [id, tier] = e.split(":");
          if (courseId && id !== courseId) return false;
          if (filters.tier && tier !== filters.tier) return false;
          return true;
        });
        if (!match) return false;
      }
      if (filters.marketing && r.marketing_status !== filters.marketing) return false;
      if (filters.health === "ok" && r.deliverability_status !== "ok") return false;
      if (filters.health === "problem" && r.deliverability_status === "ok") return false;
      if (!matchesDays([localDay(new Date(r.first_seen).getTime())], filters.added, ranges.added, now)) return false;
      if (!matchesDays(r.open_days, filters.opened, ranges.opened, now)) return false;
      if (!matchesDays(r.click_days, filters.clicked, ranges.clicked, now)) return false;
      if (!matchesDays(r.site_days, filters.site, ranges.site, now)) return false;
      if (!query) return true;
      return (
        r.email.toLowerCase().includes(query) ||
        (r.name || "").toLowerCase().includes(query) ||
        (r.phone || "").toLowerCase().includes(query)
      );
    });
  }, [rows, q, filters, ranges, now]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  // The header checkbox acts on the visible page; a separate link selects
  // every contact matching the current filters.
  const allSelected = pageRows.length > 0 && pageRows.every((r) => selectedKeys.has(contactKey(r)));
  const someSelected = pageRows.some((r) => selectedKeys.has(contactKey(r)));
  const allMatchingSelected = filtered.length > 0 && filtered.every((r) => selectedKeys.has(contactKey(r)));

  const toggleSelectAll = () => {
    const newSet = new Set(selectedKeys);
    if (allSelected) pageRows.forEach((r) => newSet.delete(contactKey(r)));
    else pageRows.forEach((r) => newSet.add(contactKey(r)));
    setSelectedKeys(newSet);
  };

  const selectAllMatching = () => {
    const newSet = new Set(selectedKeys);
    filtered.forEach((r) => newSet.add(contactKey(r)));
    setSelectedKeys(newSet);
  };

  const toggleSelect = (key: string) => {
    const newSet = new Set(selectedKeys);
    if (newSet.has(key)) newSet.delete(key);
    else newSet.add(key);
    setSelectedKeys(newSet);
  };

  const handleDownloadSelected = () => {
    const selectedRows = rows.filter((r) => selectedKeys.has(contactKey(r)));
    if (selectedRows.length === 0) return;

    const csvLines = [
      "ID,Name,Email,Phone,First Seen,Has Account,Has Contact,Has Newsletter,Has Product Lead,Has Webhook Lead"
    ];

    selectedRows.forEach((r) => {
      const id = r.user_id || "";
      const name = `"${(r.name || "").replace(/"/g, '""')}"`;
      const email = `"${r.email.replace(/"/g, '""')}"`;
      const phone = `"${(r.phone || "").replace(/"/g, '""')}"`;
      const firstSeen = r.first_seen;
      csvLines.push(`${id},${name},${email},${phone},${firstSeen},${r.has_account},${r.has_contact},${r.has_newsletter},${r.has_product_lead},${r.has_webhook_lead}`);
    });

    const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `contacts_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteSelected = async () => {
    const ok = await confirm({
      message: `Are you sure you want to permanently delete ${selectedKeys.size} contact(s)? This will completely remove their account, course access, and community posts.`,
    });
    if (!ok) return;

    setIsDeleting(true);
    setActionError("");
    try {
      const res = await fetch("/api/console/contacts/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: Array.from(selectedKeys) }),
      });

      if (!res.ok) throw new Error("Delete failed");

      setSelectedKeys(new Set());
      router.refresh();
    } catch {
      setActionError("Failed to delete contacts.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div>
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            placeholder="Search by name, email or phone…"
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm sm:w-72 outline-none focus:border-ink"
          />
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              filtersOpen || activeFilterCount > 0 ? "border-ink text-ink" : "border-line text-ink-soft hover:border-ink hover:text-ink"
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M3 5h18M6 12h12M10 19h4" strokeLinecap="round" />
            </svg>
            Filter
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-ink px-1.5 text-[11px] leading-5 text-paper">{activeFilterCount}</span>
            )}
          </button>
          <span className="text-xs text-ink-soft">
            {filtered.length} of {rows.length}
          </span>
          {actionError && <span className="text-xs text-red-600">{actionError}</span>}
        </div>

        {selectedKeys.size > 0 && (
          <div className="flex items-center gap-3 rounded-full bg-paper-soft px-4 py-2 border border-line shadow-sm">
            <span className="text-sm font-medium">{selectedKeys.size} selected</span>
            <button
              onClick={handleDownloadSelected}
              className="rounded-full bg-ink px-4 py-1.5 text-xs font-medium text-paper transition-opacity hover:opacity-80"
            >
              Download
            </button>
            <button
              onClick={handleDeleteSelected}
              disabled={isDeleting}
              className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        )}
      </div>

      {filtersOpen && (
        <div className="mt-3 rounded-2xl border border-line bg-paper p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-soft">Account</p>
              <div className="flex flex-wrap gap-1.5">
                {(["", "account", "guest"] as const).map((f) => (
                  <button
                    key={f || "all"}
                    type="button"
                    onClick={() => setFilter("account", f)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      filters.account === f ? "border-ink bg-ink text-paper" : "border-line text-ink-soft hover:border-ink"
                    }`}
                  >
                    {f === "" ? "All" : f === "account" ? "Has account" : "Guest only"}
                  </button>
                ))}
              </div>
            </div>
            {FILTER_FIELDS(courses).map((field) => (
              <div key={field.key}>
                <p className="mb-1.5 text-xs font-medium text-ink-soft">{field.label}</p>
                <BrandSelect
                  compact
                  value={filters[field.key]}
                  onChange={(v) => setFilter(field.key, v as Filters[typeof field.key])}
                  disabled={field.key === "tier" && filters.course === "none"}
                  options={field.options}
                />
                {filters[field.key] === "custom" && isDateKey(field.key) && (
                  <div className="mt-2 space-y-1.5">
                    {(["from", "to"] as const).map((end) => {
                      const dateKey = field.key as DateKey;
                      const range = ranges[dateKey];
                      return (
                        <div key={end} className="flex items-center gap-2 text-xs text-ink-soft">
                          <span className="w-8">{end === "from" ? "From" : "To"}</span>
                          <BrandDatePicker
                            fullWidth
                            value={range[end]}
                            min={end === "to" ? range.from || undefined : undefined}
                            max={end === "from" ? range.to || undefined : undefined}
                            onChange={(value) => {
                              setRanges((current) => ({ ...current, [dateKey]: { ...current[dateKey], [end]: value } }));
                              setPage(0);
                            }}
                            ariaLabel={`${field.label}: ${end === "from" ? "from" : "to"} date`}
                            placeholder={end === "from" ? "Start" : "Today"}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
            <button
              type="button"
              onClick={() => {
                setFilters(EMPTY_FILTERS);
                setRanges(EMPTY_RANGES);
                setPage(0);
              }}
              disabled={activeFilterCount === 0}
              className="text-xs font-medium text-ink-soft underline hover:text-ink disabled:no-underline disabled:opacity-40"
            >
              Clear all
            </button>
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="rounded-full bg-ink px-4 py-1.5 text-xs font-medium text-paper transition-opacity hover:opacity-80"
            >
              Show {filtered.length} {filtered.length === 1 ? "contact" : "contacts"}
            </button>
          </div>
        </div>
      )}

      {!filtersOpen && activeFilterCount > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {activeFilterChips(filters, courses, ranges).map((chip) => (
            <span
              key={chip.key}
              className="flex items-center gap-1 rounded-full border border-line bg-paper-soft py-1 pl-3 pr-1.5 text-xs"
            >
              {chip.label}
              <button
                type="button"
                onClick={() => setFilter(chip.key, "" as Filters[typeof chip.key])}
                aria-label={`Remove filter: ${chip.label}`}
                className="rounded-full px-1 text-ink-soft hover:text-ink"
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => {
              setFilters(EMPTY_FILTERS);
              setRanges(EMPTY_RANGES);
              setPage(0);
            }}
            className="text-xs font-medium text-ink-soft underline hover:text-ink"
          >
            Clear all
          </button>
        </div>
      )}

      {allSelected && !allMatchingSelected && filtered.length > pageRows.length && (
        <p className="mt-3 text-xs text-ink-soft">
          All {pageRows.length} on this page are selected.{" "}
          <button type="button" onClick={selectAllMatching} className="font-medium text-ink underline">
            Select all {filtered.length} matching contacts
          </button>
        </p>
      )}

      <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-paper">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-medium w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(input) => {
                    if (input) {
                      input.indeterminate = !allSelected && someSelected;
                    }
                  }}
                  onChange={toggleSelectAll}
                  className="rounded border-line accent-ink"
                />
              </th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Email status</th>
              <th className="px-4 py-3 font-medium">Last activity</th>
              <th className="px-4 py-3 font-medium">First seen</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => {
              const key = contactKey(r);
              const isSelected = selectedKeys.has(key);
              return (
                <tr key={key} className={`border-b border-line last:border-0 hover:bg-paper-soft ${isSelected ? "bg-paper-soft" : ""}`}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(key)}
                      className="rounded border-line accent-ink"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/console/contacts/${key}`} className="font-medium hover:underline">
                      {r.name || "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{r.email}</td>
                  <td className="px-4 py-3 text-ink-soft">{r.phone || "—"}</td>
                  <td className="px-4 py-3">
                    <SourceTags row={r} />
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-soft">
                    <p>{r.marketing_status.replace(/_/g, " ")}</p>
                    {r.deliverability_status !== "ok" && <p className="text-red-600">{r.deliverability_status}</p>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-soft">
                    {/* Optional chaining even though the type says these are
                        always arrays. They come straight off a hand-written
                        SELECT, and a caller that forgets the subquery hands
                        this `undefined` and takes the whole page down with
                        it -- which is exactly what happened to the segment
                        page (IM-WEBSITE-K/M) before b7621f38 added the
                        missing columns. A dash in one cell is the right
                        failure here, not a 500. */}
                    <p>Email: {formatDay(r.open_days?.[0])}</p>
                    {r.has_account && <p>Website: {formatDay(r.site_days?.[0])}</p>}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{formatTimestamp(r.first_seen)}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td className="px-4 py-3 text-ink-soft" colSpan={9}>
                  No contacts match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-soft">
        <div className="flex items-center gap-2">
          <span className="text-xs">Show</span>
          <div className="w-20">
            <BrandSelect
              compact
              value={String(pageSize)}
              onChange={(v) => {
                setPageSize(Number(v));
                setPage(0);
              }}
              options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
            />
          </div>
          <span className="text-xs">
            per page ·{" "}
            {filtered.length === 0
              ? "0"
              : `${currentPage * pageSize + 1} to ${Math.min((currentPage + 1) * pageSize, filtered.length)}`}{" "}
            of {filtered.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(0)}
            disabled={currentPage === 0}
            className="rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:border-ink disabled:opacity-40"
          >
            First
          </button>
          <button
            onClick={() => setPage(currentPage - 1)}
            disabled={currentPage === 0}
            className="rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:border-ink disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs">
            Page {currentPage + 1} of {pageCount}
          </span>
          <button
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage >= pageCount - 1}
            className="rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:border-ink disabled:opacity-40"
          >
            Next
          </button>
          <button
            onClick={() => setPage(pageCount - 1)}
            disabled={currentPage >= pageCount - 1}
            className="rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:border-ink disabled:opacity-40"
          >
            Last
          </button>
        </div>
      </div>
    </div>
  );
}
