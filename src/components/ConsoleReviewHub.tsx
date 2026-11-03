"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import BrandSelect from "@/components/BrandSelect";
import ScheduleDateTimeModal from "@/components/ScheduleDateTimeModal";
import { useConfirm } from "@/components/ConfirmDialog";
import { formatDay } from "@/lib/formatDate";
import { parseIndiaDateTime } from "@/lib/indiaTime";
import { SITE_URL } from "@/config/brand";

type Location = { id:number; title:string; address_text:string|null; selected:boolean; review_url:string|null; show_publicly:boolean; is_manual:boolean };
type Contact = { id:number; email:string; name:string|null; phone:string|null };
type Template = { key:string; label:string };
type GoogleReview = { review_id:string; reviewer_name:string|null; star_rating:number; comment:string|null; create_time:string|null; reply_comment:string|null };
type RequestRow = { id:number; name:string|null; email:string; channel:string; whatsapp_template_key:string|null; status:string; scheduled_for:string; sent_at:string|null; delivered_at:string|null; first_opened_at:string|null; clicked_at:string|null; last_error:string|null };

const GOOGLE_NOTICES:Record<string,string>={
  connected:"Google authorization succeeded. Select the correct Business Profile location below.",
  "access-pending":"Your Google account is authorized. Google Business Profile API access is still pending, so automatic location discovery is unavailable. You can save the business and official review link manually below now.",
  "oauth-error":"Google did not return a complete authorization response. Please try Connect Google again.",
  "invalid-state":"The Google authorization session expired or could not be verified. Please try Connect Google again.",
  "api-error":"Google authorization could not be saved. Please try again; if it repeats, check the connection error shown below.",
  "missing-config":"Google OAuth configuration is missing in Coolify.",
};

export default function ConsoleReviewHub({ initialGoogleResult, configured, notificationsConfigured, connection, locations, contacts, templates, googleReviews, requests }: {
  initialGoogleResult:string;
  configured:boolean;
  notificationsConfigured:boolean;
  connection:{status:string;last_error:string|null;last_checked_at:string|null}|null;
  locations:Location[];
  contacts:Contact[];
  templates:Template[];
  googleReviews:GoogleReview[];
  requests:RequestRow[];
}) {
  const router=useRouter();
  const selected=locations.find((item)=>item.selected) || locations[0];
  const [locationId,setLocationId]=useState(selected ? String(selected.id) : "");
  const [reviewUrl,setReviewUrl]=useState(selected?.review_url || "");
  const [showPublicly,setShowPublicly]=useState(selected?.show_publicly || false);
  const [businessTitle,setBusinessTitle]=useState("");
  const [contactId,setContactId]=useState("");
  const [templateKey,setTemplateKey]=useState(templates.find((template)=>template.key==="google-review-request")?.key || templates[0]?.key || "google-review-request");
  const [whatsappTemplateKey,setWhatsappTemplateKey]=useState("customer_review_request");
  const [scheduleModalOpen,setScheduleModalOpen]=useState(false);
  const [scheduleError,setScheduleError]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [replying,setReplying]=useState<string|null>(null);
  const [reply,setReply]=useState("");
  const {confirm,dialog}=useConfirm();
  const selectedContact=contacts.find((c)=>String(c.id)===contactId);
  const hasPhone=!!selectedContact?.phone;
  const connectionLabel=connection?.status==="connected"?"Connected":connection?.status==="configuring"?(connection.last_error?"Google authorized · API pending":"Google authorized · select location"):(connection?.status||(!configured?"OAuth configuration required":"Not connected"));
  const connectionError=connection?.last_error&&/quota exceeded|requests per minute|mybusinessaccountmanagement/i.test(connection.last_error)
    ? "Google OAuth is connected, but Google has not enabled Business Profile API quota for the project yet. Automatic location discovery and review sync will become available after Google approves the pending API-access case."
    : connection?.last_error;

  async function saveLocation(){setBusy(true);const res=await fetch("/api/console/google-business/location",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({locationId:Number(locationId),businessTitle,reviewUrl,showPublicly})});const body=await res.json().catch(()=>({}));setBusy(false);setMessage(res.ok?"Google location settings saved.":body.error||"Could not save Google location settings.");if(res.ok){setLocationId(String(body.locationId));router.refresh();}}
  async function sync(){setBusy(true);const res=await fetch("/api/console/google-business/sync",{method:"POST"});const body=await res.json();setBusy(false);setMessage(res.ok?`Synced ${body.count} Google reviews.`:body.error);if(res.ok)router.refresh();}
  async function sendImmediateRequest(){if(!contactId||!selected?.review_url)return;setBusy(true);try{const res=await fetch("/api/console/review-requests",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contactId:Number(contactId),templateKey,...(hasPhone?{whatsappTemplateKey}:{})})});const body=await res.json().catch(()=>({}));setBusy(false);if(res.ok){setMessage(body.whatsappError?`Email review request queued. WhatsApp skipped: ${body.whatsappError}`:"Review request queued for immediate sending.");setContactId("");router.refresh();}else{setMessage(body.error||"Could not send review request.");}}catch{setBusy(false);setMessage("Could not send review request.");}}
  async function scheduleRequest(scheduledTime:string){if(!contactId||!selected?.review_url)return;const parsed=parseIndiaDateTime(scheduledTime);if(!parsed){setScheduleError("Choose a future date and time in IST.");return;}setBusy(true);setScheduleError("");try{const res=await fetch("/api/console/review-requests",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contactId:Number(contactId),templateKey,scheduledFor:parsed.toISOString(),...(hasPhone?{whatsappTemplateKey}:{})})});const body=await res.json().catch(()=>({}));setBusy(false);if(res.ok){setMessage(body.whatsappError?`Email review request scheduled. WhatsApp skipped: ${body.whatsappError}`:"Review request scheduled.");setContactId("");setScheduleModalOpen(false);router.refresh();}else{setScheduleError(body.error||"Could not schedule review request.");}}catch{setBusy(false);setScheduleError("Could not schedule review request.");}}
  async function cancelRequest(id:number){if(!(await confirm({message:"Cancel this queued Google review request?"})))return;const res=await fetch(`/api/console/review-requests/${id}`,{method:"DELETE"});if(res.ok)router.refresh();}
  async function disconnect(){if(!(await confirm({message:"Disconnect Google Business Profile and revoke this app's token? Cached Google reviews will no longer refresh."})))return;setBusy(true);const res=await fetch("/api/console/google-business/disconnect",{method:"POST"});setBusy(false);if(res.ok)router.refresh();}
  async function publishReply(reviewId:string){if(!(await confirm({message:"Publish this reply publicly on Google?"})))return;setBusy(true);const res=await fetch(`/api/console/google-business/reviews/${encodeURIComponent(reviewId)}/reply`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({comment:reply})});const body=await res.json();setBusy(false);setMessage(res.ok?"Reply published on Google.":body.error);if(res.ok){setReplying(null);setReply("");router.refresh();}}
  async function draftReply(reviewId:string){setBusy(true);setReplying(reviewId);const res=await fetch(`/api/console/google-business/reviews/${encodeURIComponent(reviewId)}/draft-reply`,{method:"POST"});const body=await res.json();setBusy(false);if(res.ok)setReply(body.draft);else setMessage(body.error);}

  return <div className="space-y-10">
    <section className="rounded-2xl border border-line bg-paper p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-display text-xl font-semibold">Google Business Profile</h2><p className="mt-1 text-sm text-ink-soft">Owner OAuth connection for official locations, reviews, and replies.</p></div><span className={`rounded-full px-3 py-1 text-xs font-medium ${connection?.status==="connected"?"bg-emerald-100 text-emerald-800":"bg-amber-100 text-amber-800"}`}>{connectionLabel}</span></div>
      {!configured&&<p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Add GOOGLE_BUSINESS_CLIENT_ID and GOOGLE_BUSINESS_CLIENT_SECRET in Coolify, with redirect URI <code>{SITE_URL}/api/google-business/callback</code>. The existing Analytics service account is intentionally left unchanged.</p>}
      {configured&&!notificationsConfigured&&<p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">OAuth can work, but push notifications still need GOOGLE_BUSINESS_PUBSUB_TOPIC, GOOGLE_BUSINESS_PUBSUB_AUDIENCE, and GOOGLE_BUSINESS_PUBSUB_SERVICE_ACCOUNT. Six-hour reconciliation remains the fallback.</p>}
      {GOOGLE_NOTICES[initialGoogleResult]&&<p className={`mt-4 rounded-xl p-4 text-sm ${initialGoogleResult==="connected"?"bg-emerald-50 text-emerald-900":"bg-amber-50 text-amber-900"}`}>{GOOGLE_NOTICES[initialGoogleResult]}</p>}
      {connectionError&&<p className={`mt-3 rounded-xl p-3 text-sm ${connection?.status==="configuring"?"bg-amber-50 text-amber-900":"bg-red-50 text-red-700"}`}>{connectionError}</p>}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- /api/google-business/connect starts a server-side OAuth redirect, not a page; the catch-all src/app/[...slug]/page.tsx makes the linter think every path is one */}
      <div className="mt-5 flex flex-wrap gap-3"><a href="/api/google-business/connect" className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper">{connection?"Reconnect Google":"Connect Google"}</a>{connection&&<button type="button" disabled={busy||!selected?.selected||selected?.is_manual} onClick={sync} className="rounded-full border border-line px-5 py-2.5 text-sm font-medium disabled:opacity-50">Sync reviews</button>}{connection&&<button type="button" disabled={busy} onClick={disconnect} className="rounded-full border border-red-600 px-5 py-2.5 text-sm font-medium text-red-700 disabled:opacity-50">Disconnect</button>}</div>
      {connection&&<div className="mt-6 grid gap-4 md:grid-cols-2">{locations.length>0?<div><label className="text-sm font-medium">Business location</label><div className="mt-1"><BrandSelect value={locationId} onChange={(value)=>{setLocationId(value);const item=locations.find((l)=>String(l.id)===value);setReviewUrl(item?.review_url||"");setShowPublicly(item?.show_publicly||false);}} options={locations.map((l)=>({value:String(l.id),label:`${l.title}${l.is_manual?" (manual until API approval)":""}${l.address_text?` — ${l.address_text}`:""}`}))}/></div></div>:<div><label className="text-sm font-medium">Business name</label><input value={businessTitle} onChange={(e)=>setBusinessTitle(e.target.value)} placeholder="Your Google Business Profile name" className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm"/></div>}<div><label className="text-sm font-medium">Official “Ask for reviews” link</label><input value={reviewUrl} onChange={(e)=>setReviewUrl(e.target.value)} placeholder="https://g.page/r/.../review" className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm"/><p className="mt-1 text-xs text-ink-soft">In Google Business Profile on a computer: Read Reviews → Get more reviews → Copy.</p></div><label className="flex items-center gap-2 text-sm cursor-pointer select-none"><input type="checkbox" checked={showPublicly} onChange={(e)=>setShowPublicly(e.target.checked)} disabled={locations.length===0} className="h-4 w-4 rounded border-line accent-ink cursor-pointer disabled:cursor-not-allowed"/>Show synced Google reviews publicly after API access is approved</label><div><button type="button" onClick={saveLocation} disabled={busy||(!locationId&&!businessTitle.trim())||!reviewUrl.trim()} className="rounded-full border border-line px-4 py-2 text-sm font-medium disabled:opacity-50">Save Google review settings</button></div></div>}
      {!connection&&configured&&<p className="mt-4 text-sm text-ink-soft">Click Connect Google first. After Google returns here, the location and official review-link settings will appear—even while API approval is pending.</p>}
    </section>

    <section className="rounded-2xl border border-line bg-paper p-6"><h2 className="font-display text-xl font-semibold">Request an honest Google review</h2><p className="mt-1 text-sm text-ink-soft">Only subscribed, deliverable contacts are listed. Duplicate requests are blocked for 90 days.</p><div className="mt-5 grid gap-4 md:grid-cols-3"><div><label className="text-sm font-medium">Contact</label><div className="mt-1"><BrandSelect value={contactId} onChange={setContactId} options={[{value:"",label:"Select a contact"},...contacts.map((c)=>({value:String(c.id),label:`${c.name||c.email} — ${c.email}`}))]}/></div></div><div><label className="text-sm font-medium">Email template</label><div className="mt-1"><BrandSelect value={templateKey} onChange={setTemplateKey} options={templates.map((t)=>({value:t.key,label:t.label}))}/></div></div><div><label className="text-sm font-medium">WhatsApp template</label><div className="mt-1"><BrandSelect value={whatsappTemplateKey} onChange={setWhatsappTemplateKey} disabled={!hasPhone} options={[{value:"customer_review_request",label:"customer_review_request"}]}/></div>{!hasPhone&&<p className="mt-1 text-xs text-ink-soft">No phone number on file.</p>}</div></div><div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" onClick={sendImmediateRequest} disabled={busy||!contactId||!selected?.review_url} className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50">Send now</button><button type="button" onClick={()=>{setScheduleError("");setScheduleModalOpen(true);}} disabled={busy||!contactId||!selected?.review_url} className="rounded-full border border-line px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink disabled:opacity-50">Schedule</button></div>{!selected?.review_url&&<p className="mt-2 text-xs text-amber-700">Select a location and save its official Google review link first.</p>}</section>

    {message&&<p className="rounded-xl border border-line bg-paper-soft p-3 text-sm">{message}</p>}

    <section><h2 className="font-display text-xl font-semibold">Recent Google reviews</h2><p className="mt-1 text-sm text-ink-soft">Google-sourced content is clearly identified and expires from the local cache within 30 days.</p><div className="mt-4 space-y-3">{googleReviews.map((r)=><div key={r.review_id} className="rounded-2xl border border-line bg-paper p-5"><div className="flex justify-between gap-4"><div><span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-800">Google</span><span className="ml-2 text-sm">{"★".repeat(r.star_rating)}{"☆".repeat(5-r.star_rating)}</span><p className="mt-2 text-sm font-medium">{r.reviewer_name||"Google user"}</p></div>{r.create_time&&<span className="text-xs text-ink-soft">{formatDay(r.create_time)}</span>}</div>{r.comment&&<p className="mt-3 text-sm leading-6 text-ink-soft">{r.comment}</p>}{r.reply_comment?<div className="mt-3 rounded-xl bg-paper-soft p-3 text-sm"><strong>Your Google reply:</strong> {r.reply_comment}</div>:replying===r.review_id?<div className="mt-3"><textarea value={reply} onChange={(e)=>setReply(e.target.value)} rows={3} className="w-full rounded-lg border border-line p-3 text-sm"/><div className="mt-2 flex gap-2"><button type="button" onClick={()=>publishReply(r.review_id)} disabled={!reply.trim()||busy} className="rounded-full bg-ink px-4 py-2 text-xs text-paper">Approve and publish</button><button type="button" onClick={()=>setReplying(null)} className="text-xs text-ink-soft">Cancel</button></div></div>:<div className="mt-3 flex gap-3"><button type="button" onClick={()=>setReplying(r.review_id)} className="text-sm font-medium underline">Write reply</button><button type="button" onClick={()=>draftReply(r.review_id)} disabled={busy} className="text-sm font-medium underline">Draft with AI</button></div>}</div>)}{!googleReviews.length&&<p className="text-sm text-ink-soft">No synced Google reviews yet.</p>}</div></section>

    <section><h2 className="font-display text-xl font-semibold">Review request history</h2><div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-paper"><table className="w-full text-left text-sm"><thead className="border-b border-line text-ink-soft"><tr><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Lifecycle</th><th className="px-4 py-3">Scheduled</th><th className="px-4 py-3"></th></tr></thead><tbody>{requests.map((r)=><tr key={r.id} className="border-b border-line last:border-0"><td className="px-4 py-3">{r.name||r.email}<br/><span className="text-xs text-ink-soft">{r.email}</span></td><td className="px-4 py-3">{r.channel==="whatsapp"?"WhatsApp · ":""}{r.clicked_at?"Clicked → redirected to Google":r.first_opened_at?"Opened":r.delivered_at?"Delivered":r.sent_at?"Sent":r.status}{r.last_error&&<p className="text-xs text-red-700">{r.last_error}</p>}</td><td className="px-4 py-3 text-ink-soft">{new Date(r.scheduled_for).toLocaleString()}</td><td className="px-4 py-3">{r.status==="queued"&&<button type="button" onClick={()=>cancelRequest(r.id)} className="text-xs text-red-700">Cancel</button>}</td></tr>)}{!requests.length&&<tr><td colSpan={4} className="px-4 py-4 text-ink-soft">No review requests yet.</td></tr>}</tbody></table></div><p className="mt-2 text-xs text-ink-soft">A click only proves the link was opened. It does not prove that a Google review was submitted.</p></section>
    {dialog}
    {scheduleModalOpen && (
      <ScheduleDateTimeModal
        title="Schedule email"
        actionLabel="Schedule email"
        initialValue=""
        busy={busy}
        error={scheduleError}
        onClose={() => {
          setScheduleModalOpen(false);
          setScheduleError("");
        }}
        onSchedule={scheduleRequest}
      />
    )}
  </div>;
}
