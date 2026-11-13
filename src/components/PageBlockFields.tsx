"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RichTextEditor from "@/components/RichTextEditor";
import { DEFAULT_GRADIENT, formatGradient, parseGradient } from "@/lib/colorValue";
import BrandSelect from "@/components/BrandSelect";
import MediaLibraryPicker from "@/components/MediaLibraryPicker";
import AnchoredPopover from "@/components/AnchoredPopover";
import { ICON_COMPONENTS } from "@/components/pageBlocks/blockViews";
import { MERGE_TAGS, type FieldDef } from "@/lib/pageBlocks";

const inputClass =
  "w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm font-normal outline-none transition focus:border-ink";
const smallButton =
  "rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink disabled:opacity-40";

type Values = Record<string, unknown>;

function ImageField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [picking, setPicking] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/console/pages/image-upload", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      onChange(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      {value && (
        // eslint-disable-next-line @next/next/no-img-element -- console preview of any URL
        <img src={value} alt="" className="h-28 w-full rounded-xl border border-line bg-paper-soft object-cover" />
      )}
      <div className="flex flex-wrap gap-2">
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://... or upload" className={inputClass} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className={`${smallButton} shrink-0`}>
          {uploading ? "Uploading…" : "Upload"}
        </button>
        <button type="button" onClick={() => setPicking(true)} className={`${smallButton} shrink-0`}>
          Browse library
        </button>
        {value && (
          <button type="button" onClick={() => onChange("")} className={`${smallButton} shrink-0`}>
            Remove
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      {picking && (
        <MediaLibraryPicker
          onSelect={(url) => {
            onChange(url);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

/** Chooses a designed popup, and makes one when there are none.
 *
 * The "+ New" button is the point: with no popups yet, a plain dropdown is
 * a dead end -- you would have to know to leave the page, find Popups,
 * create one and come back. It creates the popup, selects it on the button
 * straight away, and opens its editor in a new tab. */
function PopupPickerField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [popups, setPopups] = useState<{ id: number; name: string }[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function fetchPopups(): Promise<{ id: number; name: string }[]> {
    const res = await fetch("/api/console/popups").catch(() => null);
    const body = (await res?.json().catch(() => ({}))) ?? {};
    return Array.isArray(body.popups)
      ? body.popups.map((p: { id: number; name: string }) => ({ id: p.id, name: p.name }))
      : [];
  }

  useEffect(() => {
    // Deferred so the fetch's setState lands in its own tick rather than
    // synchronously inside the effect.
    let cancelled = false;
    void (async () => {
      const list = await fetchPopups();
      if (!cancelled) setPopups(list);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function createPopup() {
    setBusy(true);
    const res = await fetch("/api/console/popups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New popup" }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) ?? {};
    setBusy(false);
    if (!res?.ok || !body.popup?.id) return;
    setPopups(await fetchPopups());
    onChange(String(body.popup.id));
    window.open(`/console/popups/${body.popup.id}`, "_blank", "noopener");
  }

  if (popups === null) return <p className="text-sm text-ink-soft">Loading popups…</p>;
  return (
    <div className="space-y-2">
      {popups.length > 0 && (
        <BrandSelect
          value={value}
          onChange={onChange}
          options={[{ value: "", label: "Choose a popup…" }, ...popups.map((p) => ({ value: String(p.id), label: p.name }))]}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void createPopup()}
          disabled={busy}
          className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink disabled:opacity-50"
        >
          {busy ? "Creating…" : "+ New popup"}
        </button>
        {value && (
          <a
            href={`/console/popups/${value}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink"
          >
            Edit this popup
          </a>
        )}
      </div>
      {popups.length === 0 && (
        <p className="text-xs text-ink-soft">No popups yet. Create one and design it with the same elements you use on a page.</p>
      )}
    </div>
  );
}

function FormPickerField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [forms, setForms] = useState<{ id: number; name: string }[] | null>(null);

  useEffect(() => {
    fetch("/api/console/forms")
      .then((r) => (r.ok ? r.json() : { forms: [] }))
      .then((data) => setForms(Array.isArray(data.forms) ? data.forms.filter((form: { isFixed?: boolean }) => !form.isFixed) : []))
      .catch(() => setForms([]));
  }, []);

  if (forms === null) return <p className="text-sm text-ink-soft">Loading forms…</p>;
  if (!forms.length) {
    return (
      <p className="text-sm text-ink-soft">
        No saved forms yet. Create one in <a href="/console/forms" target="_blank" rel="noreferrer" className="underline">Console -&gt; Forms</a>, then come back here.
      </p>
    );
  }
  return (
    <BrandSelect
      value={value}
      onChange={onChange}
      options={[{ value: "", label: "Choose a form…" }, ...forms.map((f) => ({ value: String(f.id), label: f.name }))]}
    />
  );
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?$/;

/** Every colour field is either a solid colour or a gradient -- the same
 * control, two modes, so a gradient is available anywhere a colour is
 * rather than only on the handful of places that happened to support one.
 * A gradient on a border or an SVG stroke falls back to its middle stop,
 * since CSS gives those no gradient. */
function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const gradient = parseGradient(value);
  const mode: "solid" | "gradient" = gradient ? "gradient" : "solid";
  const swatch = HEX_COLOR_RE.test(value) ? value : "#000000";
  const g = gradient ?? DEFAULT_GRADIENT;
  const setGradient = (next: Partial<typeof g>) => onChange(formatGradient({ ...g, ...next }));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 rounded-lg bg-paper-soft p-0.5">
        {(["solid", "gradient"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m === "gradient" ? formatGradient(g) : HEX_COLOR_RE.test(value) ? value : "")}
            className={`flex-1 rounded-md px-2 py-1 text-xs font-medium capitalize transition-colors ${
              mode === m ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {mode === "solid" ? (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={swatch}
            onChange={(e) => onChange(e.target.value)}
            aria-label="Pick a color"
            className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-paper p-1"
          />
          <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="#000000" className={inputClass} />
          {value && (
            <button type="button" onClick={() => onChange("")} className={`${smallButton} shrink-0`}>
              Clear
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div
            className="h-10 w-full rounded-lg border border-line"
            style={{ backgroundImage: `linear-gradient(${g.angle}deg, ${g.from} 0%, ${g.via} 55%, ${g.to} 100%)` }}
            aria-hidden="true"
          />
          <div className="grid grid-cols-3 gap-2">
            {(["from", "via", "to"] as const).map((stop) => (
              <label key={stop} className="grid gap-1 text-[10px] font-medium uppercase tracking-wide text-ink-soft">
                {stop}
                <input
                  type="color"
                  value={g[stop]}
                  onChange={(e) => setGradient({ [stop]: e.target.value })}
                  aria-label={`Gradient ${stop} colour`}
                  className="h-9 w-full cursor-pointer rounded-lg border border-line bg-paper p-1"
                />
              </label>
            ))}
          </div>
          <label className="grid gap-1 text-xs font-medium">
            Angle ({g.angle}&deg;)
            <input
              type="range"
              min={0}
              max={360}
              value={g.angle}
              onChange={(e) => setGradient({ angle: Number(e.target.value) })}
              className="w-full accent-ink"
            />
          </label>
          <button type="button" onClick={() => onChange("")} className={smallButton}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

/** A whole hand-written section (the "custom" block) gets a far bigger
 * ceiling than a pasted embed snippet, so it gets a taller box to write
 * in and a placeholder that matches the language it actually holds. */
function CodeField({ field, value, onChange }: { field: FieldDef; value: string; onChange: (v: string) => void }) {
  const roomy = field.kind === "code" && (field.max ?? 0) > 20_000;
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={roomy ? 20 : 10}
      spellCheck={false}
      placeholder={CODE_PLACEHOLDERS[field.key] ?? "<div>...</div>"}
      className={`${inputClass} font-mono text-xs leading-5`}
    />
  );
}

const CODE_PLACEHOLDERS: Record<string, string> = {
  html: '<div class="panel">\n  <h2>Heading</h2>\n</div>',
  css: ".panel {\n  display: grid;\n  gap: 1.5rem;\n}",
  js: 'root.querySelector(".panel")?.classList.add("ready");',
};

/** "datetime-local" inputs work in the browser's own local time and have
 * no timezone of their own, but the value is stored as a UTC ISO string
 * (see the "datetime" field kind in pageBlocks.ts) so every visitor counts
 * down to the same real instant -- this converts between the two at the
 * edges, in the admin's own browser, where the real local offset is known. */
function toLocalInputValue(utcIso: string): string {
  if (!utcIso) return "";
  const d = new Date(utcIso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function DateTimeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="datetime-local"
      value={toLocalInputValue(value)}
      onChange={(e) => {
        const raw = e.target.value;
        if (!raw) {
          onChange("");
          return;
        }
        const d = new Date(raw);
        onChange(Number.isNaN(d.getTime()) ? "" : d.toISOString());
      }}
      className={inputClass}
    />
  );
}

function ListField({
  field,
  value,
  onChange,
  linkOptions,
}: {
  field: Extract<FieldDef, { kind: "list" }>;
  value: Values[];
  onChange: (v: Values[]) => void;
  linkOptions: string[];
}) {
  const [open, setOpen] = useState<number | null>(value.length ? 0 : null);
  const blank = () => Object.fromEntries(field.fields.map((f) => [f.key, f.kind === "toggle" ? false : f.kind === "number" ? f.min : ""]));
  const move = (from: number, to: number) => {
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
    setOpen(to);
  };
  const summary = (item: Values, i: number) => {
    const first = field.fields.find((f) => f.kind === "text" && typeof item[f.key] === "string" && item[f.key]);
    return first ? String(item[first.key]) : `${field.itemLabel} ${i + 1}`;
  };

  return (
    <div className="space-y-2">
      {value.map((item, i) => (
        <div key={i} className="rounded-xl border border-line bg-paper">
          <div className="flex items-center gap-2 px-3 py-2">
            <button type="button" onClick={() => setOpen(open === i ? null : i)} className="min-w-0 flex-1 truncate text-left text-sm font-medium">
              {summary(item, i)}
            </button>
            <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, i - 1)} className={smallButton}>↑</button>
            <button type="button" aria-label="Move down" disabled={i === value.length - 1} onClick={() => move(i, i + 1)} className={smallButton}>↓</button>
            <button
              type="button"
              aria-label={`Remove ${field.itemLabel.toLowerCase()}`}
              onClick={() => {
                onChange(value.filter((_, j) => j !== i));
                setOpen(null);
              }}
              className={smallButton}
            >
              ✕
            </button>
          </div>
          {open === i && (
            <div className="space-y-4 border-t border-line p-3">
              <FieldGroup
                fields={field.fields}
                values={item}
                onChange={(next) => onChange(value.map((v, j) => (j === i ? next : v)))}
                linkOptions={linkOptions}
              />
            </div>
          )}
        </div>
      ))}
      {value.length < field.max && (
        <button
          type="button"
          onClick={() => {
            onChange([...value, blank()]);
            setOpen(value.length);
          }}
          className={smallButton}
        >
          + Add {field.itemLabel.toLowerCase()}
        </button>
      )}
    </div>
  );
}

/** Like BrandSelect, but for a field whose options ARE glyphs: a searchable
 * grid of the actual icons (WhatsApp-emoji-picker style), not a list of
 * their names. Typing still filters by label -- browsing by name alone
 * doesn't work when you don't remember what any given icon is called. */
function IconPickerField({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (open) searchInput.current?.focus();
  }, [open]);

  function pick(next: string) {
    onChange(next);
    close();
  }

  const Selected = ICON_COMPONENTS[value];

  return (
    <div className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        className={`flex w-full items-center gap-2.5 rounded-lg border border-line bg-paper px-3 py-2 text-left text-sm outline-none transition-colors focus:border-ink ${
          open ? "border-ink" : ""
        }`}
      >
        {Selected ? <Selected className="h-5 w-5 shrink-0" /> : null}
        <span className="truncate text-ink-soft">{options.find((o) => o.value === value)?.label || "Choose an icon…"}</span>
      </button>
      <AnchoredPopover anchor={trigger} open={open} onClose={close} width={296} className="p-0">
        <div className="sticky top-0 z-10 bg-paper">
          <input
            ref={searchInput}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && filtered.length > 0) {
                event.preventDefault();
                pick(filtered[0].value);
              }
            }}
            placeholder="Search icons…"
            className="w-full border-b border-line bg-paper px-4 py-2.5 text-sm outline-none placeholder:text-ink-soft/70"
          />
        </div>
        {filtered.length === 0 ? (
          <p className="px-4 py-3 text-sm text-ink-soft">No matches.</p>
        ) : (
          <div className="grid grid-cols-6 gap-1 p-2">
            {filtered.map((o) => {
              const Glyph = ICON_COMPONENTS[o.value];
              return (
                <button
                  key={o.value}
                  type="button"
                  title={o.label}
                  onClick={() => pick(o.value)}
                  className={`flex aspect-square items-center justify-center rounded-lg hover:bg-paper-soft ${
                    o.value === value ? "bg-paper-soft ring-1 ring-inset ring-ink/20" : ""
                  }`}
                >
                  {Glyph ? <Glyph className="h-5 w-5" /> : null}
                </button>
              );
            })}
          </div>
        )}
      </AnchoredPopover>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  linkOptions,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  linkOptions: string[];
}) {
  const asString = typeof value === "string" ? value : "";
  switch (field.kind) {
    case "text":
      return <input value={asString} maxLength={field.max} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} className={inputClass} />;
    case "textarea":
      return <textarea value={asString} maxLength={field.max} rows={3} onChange={(e) => onChange(e.target.value)} className={inputClass} />;
    case "richtext":
      return (
        <div className="overflow-hidden rounded-xl border border-line bg-paper">
          <RichTextEditor value={asString} onChange={onChange} imageUploadUrl="/api/console/pages/image-upload" />
        </div>
      );
    case "link":
      return (
        <>
          <input value={asString} list="page-link-options" placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} className={inputClass} />
          <datalist id="page-link-options">
            {linkOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </>
      );
    case "image":
      return <ImageField value={asString} onChange={onChange} />;
    case "select":
      return (
        <BrandSelect
          value={asString || field.options[0]?.value || ""}
          onChange={onChange}
          options={field.options}
        />
      );
    case "iconPicker":
      return <IconPickerField value={asString || field.options[0]?.value || ""} onChange={onChange} options={field.options} />;
    case "formPicker":
      return <FormPickerField value={asString} onChange={onChange} />;
    case "popupPicker":
      return <PopupPickerField value={asString} onChange={onChange} />;
    case "number":
      return (
        <input
          type="number"
          min={field.min}
          max={field.max}
          value={typeof value === "number" ? value : field.min}
          onChange={(e) => onChange(Math.min(field.max, Math.max(field.min, Number(e.target.value) || field.min)))}
          className={`${inputClass} max-w-[8rem]`}
        />
      );
    case "toggle":
      return (
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
          {value === true ? "On" : "Off"}
        </label>
      );
    case "list":
      return <ListField field={field} value={Array.isArray(value) ? (value as Values[]) : []} onChange={onChange} linkOptions={linkOptions} />;
    case "color":
      return <ColorField value={asString} onChange={onChange} />;
    case "code":
      return <CodeField field={field} value={asString} onChange={onChange} />;
    case "datetime":
      return <DateTimeField value={asString} onChange={onChange} />;
  }
}

/** A form for any set of block fields, built from the block registry. */
export function FieldGroup({
  fields,
  values,
  onChange,
  linkOptions,
}: {
  fields: FieldDef[];
  values: Values;
  onChange: (next: Values) => void;
  linkOptions: string[];
}) {
  return (
    <>
      {fields.map((field) =>
        field.kind === "toggle" ? (
          <div key={field.key} className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-ink">{field.label}</span>
            <FieldInput field={field} value={values[field.key]} onChange={(v) => onChange({ ...values, [field.key]: v })} linkOptions={linkOptions} />
          </div>
        ) : (
          <div key={field.key} className="grid gap-1.5">
            <span className="text-sm font-medium text-ink">{field.label}</span>
            <FieldInput field={field} value={values[field.key]} onChange={(v) => onChange({ ...values, [field.key]: v })} linkOptions={linkOptions} />
            {field.help && <span className="text-xs text-ink-soft">{field.help}</span>}
          </div>
        )
      )}
    </>
  );
}

export function MergeTagHint() {
  return (
    <details className="rounded-xl bg-paper-soft px-4 py-3 text-xs text-ink-soft">
      <summary className="cursor-pointer font-medium text-ink">Placeholders you can type in any text</summary>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2">
        {MERGE_TAGS.map((t) => (
          <li key={t.tag}>
            <code className="text-ink">{t.tag}</code> {t.label}
          </li>
        ))}
      </ul>
    </details>
  );
}
