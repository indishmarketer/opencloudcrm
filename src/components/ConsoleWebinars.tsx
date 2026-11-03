"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import ConsoleModal from "@/components/ConsoleModal";
import WebinarArtwork from "@/components/WebinarArtwork";
import { useConfirm } from "@/components/ConfirmDialog";

type AgendaItem = { title: string; description: string };
type Webinar = {
  id: number; slug: string; title: string; subtitle: string | null; description: string | null;
  thumbnail_url: string | null; presenter_name: string | null; presenter_title: string | null;
  presenter_bio: string | null; presenter_image_url: string | null; audience: string | null;
  key_takeaways: string[] | null; agenda: AgendaItem[] | null; cta_label: string | null;
  cta_url: string | null; seo_title: string | null; seo_description: string | null; featured: boolean;
  mux_upload_id: string | null; mux_playback_id: string | null; pending_mux_upload_id: string | null;
  pending_mux_passthrough?: string | null;
  status: "draft" | "processing" | "ready" | "errored" | "published" | "archived";
  duration_seconds: number | null; access_tier: "free" | "pro"; release_at: string | null;
  requires_registration: boolean; registration_count: number; question_count: number; active_schedule_count: number; updated_at: string;
};

type FormState = {
  title: string; slug: string; subtitle: string; description: string; presenter_name: string;
  presenter_title: string; presenter_bio: string; audience: string; takeaways: string; agenda: string;
  cta_label: string; cta_url: string; seo_title: string; seo_description: string;
  access_tier: "free" | "pro"; requires_registration: boolean; featured: boolean; release_at: string;
};

const emptyForm: FormState = {
  title: "", slug: "", subtitle: "", description: "", presenter_name: "", presenter_title: "",
  presenter_bio: "", audience: "", takeaways: "", agenda: "", cta_label: "", cta_url: "",
  seo_title: "", seo_description: "", access_tier: "free", requires_registration: true,
  featured: false, release_at: "",
};
const inputClass = "mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink";
const buttonClass = "rounded-full border border-line px-3.5 py-2 text-xs font-medium transition hover:border-ink disabled:opacity-40";

function formFromWebinar(w: Webinar): FormState {
  return {
    title: w.title, slug: w.slug, subtitle: w.subtitle || "", description: w.description || "",
    presenter_name: w.presenter_name || "", presenter_title: w.presenter_title || "",
    presenter_bio: w.presenter_bio || "", audience: w.audience || "",
    takeaways: (w.key_takeaways || []).join("\n"),
    agenda: (w.agenda || []).map((item) => `${item.title}${item.description ? ` | ${item.description}` : ""}`).join("\n"),
    cta_label: w.cta_label || "", cta_url: w.cta_url || "", seo_title: w.seo_title || "",
    seo_description: w.seo_description || "", access_tier: w.access_tier,
    requires_registration: w.requires_registration, featured: w.featured,
    release_at: w.release_at ? new Date(w.release_at).toISOString().slice(0, 16) : "",
  };
}

function requestBody(form: FormState) {
  const lines = (value: string) => value.split("\n").map((item) => item.trim()).filter(Boolean);
  const { takeaways, ...fields } = form;
  return {
    ...fields,
    subtitle: form.subtitle || null, description: form.description || null, presenter_name: form.presenter_name || null,
    presenter_title: form.presenter_title || null, presenter_bio: form.presenter_bio || null, audience: form.audience || null,
    key_takeaways: lines(takeaways),
    agenda: lines(form.agenda).map((line) => { const [title, ...rest] = line.split("|"); return { title: title.trim(), description: rest.join("|").trim() }; }),
    cta_label: form.cta_label || null, cta_url: form.cta_url || null, seo_title: form.seo_title || null,
    seo_description: form.seo_description || null, release_at: form.release_at ? new Date(form.release_at).toISOString() : null,
  };
}

function readiness(w: Webinar) {
  const missing: string[] = [];
  if (!w.description) missing.push("description");
  if (!w.thumbnail_url) missing.push("thumbnail");
  if (!w.presenter_name) missing.push("presenter");
  if (!Array.isArray(w.key_takeaways) || w.key_takeaways.length < 3) missing.push("3 takeaways");
  if (!w.mux_playback_id) missing.push("processed video");
  if (Number(w.active_schedule_count || 0) < 1) missing.push("active schedule");
  return missing;
}

function Metric({ value, label }: { value: number; label: string }) {
  return <div className="rounded-2xl border border-line bg-paper p-4"><p className="font-display text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-ink-soft">{label}</p></div>;
}
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="block text-xs font-medium text-ink-soft">{label}{children}{hint && <span className="mt-1 block font-normal">{hint}</span>}</label>;
}

function Editor({ form, setForm }: { form: FormState; setForm: (value: FormState) => void }) {
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm({ ...form, [key]: value });
  return <div className="space-y-7">
    <section><h4 className="font-medium">Landing page</h4><div className="mt-3 grid gap-4 md:grid-cols-2">
      <Field label="Title"><input className={inputClass} value={form.title} onChange={(e) => set("title", e.target.value)} /></Field>
      <Field label="URL slug"><input className={inputClass} value={form.slug} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} /></Field>
      <div className="md:col-span-2"><Field label="Short promise"><input className={inputClass} value={form.subtitle} onChange={(e) => set("subtitle", e.target.value)} placeholder="One sentence that makes the outcome clear" /></Field></div>
      <div className="md:col-span-2"><Field label="Full description"><textarea className={inputClass} rows={5} value={form.description} onChange={(e) => set("description", e.target.value)} /></Field></div>
      <div className="md:col-span-2"><Field label="Who this is for"><textarea className={inputClass} rows={3} value={form.audience} onChange={(e) => set("audience", e.target.value)} /></Field></div>
      <Field label="Key takeaways" hint="One per line; add at least three."><textarea className={inputClass} rows={6} value={form.takeaways} onChange={(e) => set("takeaways", e.target.value)} /></Field>
      <Field label="Agenda" hint="One per line: Topic | What it covers"><textarea className={inputClass} rows={6} value={form.agenda} onChange={(e) => set("agenda", e.target.value)} /></Field>
    </div></section>
    <section><h4 className="font-medium">Presenter</h4><div className="mt-3 grid gap-4 md:grid-cols-2">
      <Field label="Name"><input className={inputClass} value={form.presenter_name} onChange={(e) => set("presenter_name", e.target.value)} /></Field>
      <Field label="Role or credential"><input className={inputClass} value={form.presenter_title} onChange={(e) => set("presenter_title", e.target.value)} /></Field>
      <div className="md:col-span-2"><Field label="Bio"><textarea className={inputClass} rows={3} value={form.presenter_bio} onChange={(e) => set("presenter_bio", e.target.value)} /></Field></div>
    </div></section>
    <section><h4 className="font-medium">Access and conversion</h4><div className="mt-3 grid gap-4 md:grid-cols-2">
      <Field label="Access tier"><div className="mt-2 flex gap-2">{(["free", "pro"] as const).map((tier) => <button type="button" key={tier} onClick={() => set("access_tier", tier)} className={`${buttonClass} ${form.access_tier === tier ? "border-ink bg-ink text-paper" : ""}`}>{tier.toUpperCase()}</button>)}</div></Field>
      <Field label="Release date" hint="Leave blank for immediate access."><input type="datetime-local" className={inputClass} value={form.release_at} onChange={(e) => set("release_at", e.target.value)} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.requires_registration} onChange={(e) => set("requires_registration", e.target.checked)} /> Collect registration before viewing</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.featured} onChange={(e) => set("featured", e.target.checked)} /> Feature at the top of the library</label>
      <Field label="Post-webinar button label"><input className={inputClass} value={form.cta_label} onChange={(e) => set("cta_label", e.target.value)} placeholder="Book a strategy call" /></Field>
      <Field label="Post-webinar button URL"><input className={inputClass} value={form.cta_url} onChange={(e) => set("cta_url", e.target.value)} placeholder="/contact or https://…" /></Field>
    </div></section>
    <section><h4 className="font-medium">Search preview</h4><div className="mt-3 grid gap-4 md:grid-cols-2">
      <Field label={`SEO title (${form.seo_title.length}/70)`}><input className={inputClass} maxLength={70} value={form.seo_title} onChange={(e) => set("seo_title", e.target.value)} /></Field>
      <Field label={`SEO description (${form.seo_description.length}/170)`}><textarea className={inputClass} rows={3} maxLength={170} value={form.seo_description} onChange={(e) => set("seo_description", e.target.value)} /></Field>
    </div></section>
  </div>;
}

export default function ConsoleWebinars({ initialWebinars }: { initialWebinars: Webinar[] }) {
  const [webinars, setWebinars] = useState(initialWebinars);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<Webinar | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [videoFiles, setVideoFiles] = useState<Record<number, File | undefined>>({});
  const [uploading, setUploading] = useState<{ id: number; progress: number } | null>(null);
  const { confirm, dialog } = useConfirm();
  const shown = useMemo(() => webinars.filter((w) => `${w.title} ${w.presenter_name || ""}`.toLowerCase().includes(query.toLowerCase())), [webinars, query]);
  const registrations = webinars.reduce((sum, w) => sum + Number(w.registration_count || 0), 0);

  async function refresh() {
    const response = await fetch("/api/console/webinars", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (response.ok) setWebinars(body.webinars || []);
  }
  async function save() {
    if (!form.title.trim() || !form.slug.trim()) return setError("Add a title and URL slug.");
    setBusy(true); setError("");
    const response = await fetch(editing ? `/api/console/webinars/${editing.id}` : "/api/console/webinars", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody(form)) });
    const body = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) return setError(body.error || "Could not save the webinar.");
    setWebinars((current) => editing ? current.map((w) => w.id === body.webinar.id ? body.webinar : w) : [body.webinar, ...current]);
    setEditing(null); setCreating(false); setForm(emptyForm);
  }
  async function changeStatus(w: Webinar, status: Webinar["status"]) {
    const ok = await confirm({ message: status === "published" ? `Publish "${w.title}" to the webinar library?` : `Archive "${w.title}" and remove it from the public library?`, confirmLabel: status === "published" ? "Publish" : "Archive" });
    if (!ok) return;
    setBusy(true); setError("");
    const response = await fetch(`/api/console/webinars/${w.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const body = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) return setError(body.error || "Could not change publication status.");
    setWebinars((current) => current.map((item) => item.id === w.id ? body.webinar : item));
  }
  async function remove(w: Webinar) {
    const ok = await confirm({ message: `Permanently delete "${w.title}", its registrations, discussion, images, and video?`, confirmLabel: "Delete" });
    if (!ok) return;
    setBusy(true); setError(""); const response = await fetch(`/api/console/webinars/${w.id}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) return setError(body.error || "Could not delete the webinar.");
    setWebinars((current) => current.filter((item) => item.id !== w.id));
  }
  async function uploadImage(w: Webinar, kind: "thumbnail" | "presenter", file?: File) {
    if (!file) return; setBusy(true); setError(""); const data = new FormData(); data.set("file", file);
    const response = await fetch(`/api/console/webinars/${w.id}/image?kind=${kind}`, { method: "POST", body: data });
    const body = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) return setError(body.error || "Could not upload the image."); await refresh();
  }
  async function removeImage(w: Webinar, kind: "thumbnail" | "presenter") {
    const label = kind === "thumbnail" ? "webinar thumbnail" : "presenter image";
    const approved = await confirm({ message: `Remove this ${label} from the webinar and Cloudflare R2?`, confirmLabel: "Remove image" });
    if (!approved) return;
    setBusy(true); setError("");
    const response = await fetch(`/api/console/webinars/${w.id}/image?kind=${kind}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(body.error || "Could not remove the image.");
    await refresh();
  }
  async function uploadVideo(w: Webinar) {
    const file = videoFiles[w.id]; if (!file) return setError("Choose a video file for this webinar first.");
    if (file.size > 2 * 1024 ** 3) return setError("Video files must be 2 GB or smaller.");
    setBusy(true); setError(""); setUploading({ id: w.id, progress: 0 });
    try {
      const mint = await fetch("/api/webinars/upload-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ webinarId: w.id }) });
      const prepared = await mint.json().catch(() => ({})); if (!mint.ok || !prepared.url) throw new Error(prepared.error || "Could not prepare the upload.");
      await new Promise<void>((resolve, reject) => { const xhr = new XMLHttpRequest(); xhr.open("PUT", prepared.url); if (file.type) xhr.setRequestHeader("Content-Type", file.type); xhr.upload.onprogress = (event) => event.lengthComputable && setUploading({ id: w.id, progress: Math.round(event.loaded / event.total * 100) }); xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}).`)); xhr.onerror = () => reject(new Error("The upload was interrupted.")); xhr.send(file); });
      setVideoFiles((current) => ({ ...current, [w.id]: undefined })); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not upload the video."); }
    finally { setBusy(false); setUploading(null); }
  }

  return <div>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-soft">Content studio</p><h1 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">Webinars</h1><p className="mt-2 max-w-2xl text-sm text-ink-soft">Build a complete landing page, collect leads, and publish only when every essential is ready.</p></div><button onClick={() => { setEditing(null); setForm(emptyForm); setCreating(true); setError(""); }} className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper">Create webinar</button></div>
    <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4"><Metric value={webinars.length} label="Total" /><Metric value={webinars.filter((w) => w.status === "published").length} label="Published" /><Metric value={webinars.filter((w) => w.status !== "published" && w.status !== "archived").length} label="In progress" /><Metric value={registrations} label="Registrations" /></div>
    <div className="mt-7"><input aria-label="Search webinars" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title or presenter..." className={`${inputClass} max-w-md`} /></div>
    {error && <p role="alert" className="mt-4 rounded-xl border border-red-600 p-3 text-sm text-red-600">{error}</p>}
    <div className="mt-6 space-y-5">
      {shown.map((w) => {
        const missing = readiness(w);
        return <article key={w.id} className="overflow-hidden rounded-2xl border border-line bg-paper">
          <div className="grid gap-5 p-5 lg:grid-cols-[260px_minmax(0,1fr)]">
            <WebinarArtwork thumbnailUrl={w.thumbnail_url} title={w.title} sizes="260px" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-line px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide">{w.status}</span>
                    <span className="rounded-full bg-ink px-2.5 py-1 text-[11px] font-medium text-paper">{w.access_tier.toUpperCase()}</span>
                    {w.featured && <span className="text-xs font-medium text-ink-soft">Featured</span>}
                  </div>
                  <h2 className="mt-3 font-display text-2xl font-semibold">{w.title}</h2>
                  <p className="mt-1 max-w-2xl text-sm text-ink-soft">{w.subtitle || w.description || "Add a clear promise for this webinar."}</p>
                </div>
                <div className="grid shrink-0 grid-cols-2 divide-x divide-line overflow-hidden rounded-xl border border-line text-center text-xs text-ink-soft">
                  <span className="px-4 py-2.5"><strong className="block text-lg text-ink">{w.registration_count || 0}</strong>Registrations</span>
                  <span className="px-4 py-2.5"><strong className="block text-lg text-ink">{w.question_count || 0}</strong>Questions</span>
                </div>
              </div>

              <div className={`mt-5 rounded-xl border p-3 text-xs ${missing.length ? "border-line bg-paper-soft" : "border-green-200 bg-green-50 text-green-800"}`}>
                <span className="font-semibold">{missing.length ? "Needs attention" : "Ready to publish"}</span>
                {missing.length > 0 && <span className="text-ink-soft">: {missing.join(", ")}</span>}
              </div>
              {w.pending_mux_upload_id && <p className="mt-3 text-xs text-ink-soft">A replacement video is processing. The current published recording remains available until it is ready.</p>}
              {w.status === "errored" && <p className="mt-3 text-xs text-red-600">The last video could not be processed. Upload a new file.</p>}

              <div className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-2 xl:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold text-ink">Manage</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button className={buttonClass} onClick={() => { setEditing(w); setCreating(false); setForm(formFromWebinar(w)); setError(""); }}>Edit details</button>
                    <Link className={buttonClass} href={`/console/webinars/${w.id}/registrations`}>Registrations</Link>
                    <Link className={buttonClass} href={`/console/webinars/${w.id}/automation`}>Schedule</Link>
                    <Link className={buttonClass} href={`/console/webinars/${w.id}/engagement`}>Questions</Link>
                  </div>
                </div>
                {w.status === "published" && <div>
                  <p className="text-xs font-semibold text-ink">Experience</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link className={buttonClass} href={`/webinars/${w.slug}`} target="_blank">Landing page</Link>
                    <Link className={buttonClass} href={`/webinars/${w.slug}/room?preview=1`} target="_blank">Preview room</Link>
                  </div>
                </div>}
                <div>
                  <p className="text-xs font-semibold text-ink">Publication</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {w.status !== "published" && <button className={`${buttonClass} border-ink bg-ink text-paper`} disabled={busy || missing.length > 0} onClick={() => changeStatus(w, "published")}>Publish</button>}
                    {w.status === "published" && <button className={buttonClass} disabled={busy} onClick={() => changeStatus(w, "archived")}>Archive</button>}
                    <button className={`${buttonClass} text-red-600`} disabled={busy} onClick={() => remove(w)}>Delete</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 border-t border-line bg-paper-soft p-5 lg:grid-cols-2">
            <section className="rounded-xl border border-line bg-paper p-4">
              <p className="text-sm font-semibold">Artwork</p>
              <p className="mt-1 text-xs text-ink-soft">Use 16:9 JPG, PNG, or WebP. Replacing or removing an image also removes the old file from Cloudflare R2.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-line p-3">
                  <p className="text-xs font-medium">Library thumbnail</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <label className={buttonClass}>Upload<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => uploadImage(w, "thumbnail", e.target.files?.[0])} /></label>
                    {w.thumbnail_url && <button className={`${buttonClass} text-red-600`} disabled={busy} onClick={() => removeImage(w, "thumbnail")}>Remove</button>}
                  </div>
                </div>
                <div className="rounded-lg border border-line p-3">
                  <p className="text-xs font-medium">Presenter image</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <label className={buttonClass}>Upload<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => uploadImage(w, "presenter", e.target.files?.[0])} /></label>
                    {w.presenter_image_url && <button className={`${buttonClass} text-red-600`} disabled={busy} onClick={() => removeImage(w, "presenter")}>Remove</button>}
                  </div>
                </div>
              </div>
            </section>
            <section className="rounded-xl border border-line bg-paper p-4">
              <p className="text-sm font-semibold">Recording</p>
              <p className="mt-1 text-xs text-ink-soft">A replacement never interrupts the current published recording. Replaced and deleted videos are removed from video storage.</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(e) => setVideoFiles((current) => ({ ...current, [w.id]: e.target.files?.[0] }))} className="max-w-xs text-xs file:mr-3 file:rounded-full file:border file:border-line file:bg-paper file:px-3 file:py-2" />
                <button className={`${buttonClass} border-ink bg-ink text-paper`} disabled={busy || !videoFiles[w.id]} onClick={() => uploadVideo(w)}>{uploading?.id === w.id ? `Uploading ${uploading.progress}%` : w.mux_playback_id ? "Replace recording" : "Upload recording"}</button>
              </div>
              {uploading?.id === w.id && <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full bg-ink" style={{ width: `${uploading.progress}%` }} /></div>}
            </section>
          </div>
        </article>;
      })}
      {!shown.length && <p className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-ink-soft">{webinars.length ? "No webinars match your search." : "No webinars yet. Create the first one to open the studio."}</p>}
    </div>
    {(creating || editing) && <ConsoleModal wide title={editing ? "Edit webinar" : "Create webinar"} onClose={() => { setCreating(false); setEditing(null); setError(""); }}><Editor form={form} setForm={setForm} />{error && <p role="alert" className="mt-5 text-sm text-red-600">{error}</p>}<div className="mt-7 flex justify-end gap-3"><button className={buttonClass} onClick={() => { setCreating(false); setEditing(null); }}>Cancel</button><button className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper disabled:opacity-40" disabled={busy} onClick={save}>{busy ? "Saving..." : editing ? "Save changes" : "Create draft"}</button></div></ConsoleModal>}{dialog}
  </div>;
}
