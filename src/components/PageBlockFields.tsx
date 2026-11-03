"use client";

import { useRef, useState } from "react";
import RichTextEditor from "@/components/RichTextEditor";
import BrandSelect from "@/components/BrandSelect";
import MediaLibraryPicker from "@/components/MediaLibraryPicker";
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

const HEX_COLOR_RE = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?$/;

function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const swatch = HEX_COLOR_RE.test(value) ? value : "#000000";
  return (
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
