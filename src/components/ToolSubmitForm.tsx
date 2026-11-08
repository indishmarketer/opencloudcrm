"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import Turnstile from "@/components/Turnstile";
import BrandSelect from "@/components/BrandSelect";
import DirectoryListingCheckout from "@/components/DirectoryListingCheckout";
import { trackEvent } from "@/lib/gtag";
import { PRICING_OPTIONS } from "@/lib/directoryFields";

const MAX_SCREENSHOTS = 4;
const DRAFT_KEY = "directory-submit-draft";

type Category = { id: number; slug: string; name: string };

/** Everything the paid tier's checkout needs, resolved on the server when
 * the page rendered. Null `method` means neither provider is configured, in
 * which case the paid tier still submits and we chase the payment by hand. */
export type SubmitCheckout = {
  method: "razorpay" | "paypal" | null;
  amount: number;
  currency: "INR" | "USD";
  razorpayKeyId: string | null;
  paypalClientId: string | null;
  name: string;
  email: string;
  phone: string | null;
};

type Draft = {
  website_url: string;
  /** The exact text that was last sent to the inspector. Anything else in
   * `website_url` means the fetched fields below belong to a different
   * tool and must not be reused. */
  looked_up: string;
  /** og:image found on their page, offered as a first screenshot. */
  image: string;
  name: string;
  tagline: string;
  description: string;
  category_id: string;
  pricing_type: string;
  listing_tier: "free" | "paid";
};

const EMPTY: Draft = {
  website_url: "",
  looked_up: "",
  image: "",
  name: "",
  tagline: "",
  description: "",
  category_id: "",
  pricing_type: "free",
  listing_tier: "free",
};

const STEPS = [
  { key: "link", label: "Your link" },
  { key: "details", label: "Details" },
  { key: "tier", label: "Listing type" },
  { key: "assets", label: "Images" },
] as const;

/**
 * Submitting a tool, in the order a person actually has one: paste the
 * link, check what we read off it, choose how it gets listed, make an
 * account, add images, submit, and pay if they picked the paid tier.
 *
 * **Why the account step is last-ish.** It used to be first, and a
 * logged-out visitor saw nothing but a login wall where the form should be.
 * Someone who has not decided whether this is worth doing will not create
 * an account to find out what the form asks for.
 *
 * **Why screenshots come after the account, not before.** The obvious
 * design is to collect everything, then sign up. It does not work here:
 * `/api/auth/signup` deliberately does not create a session, the person has
 * to confirm their email first. That gap can be minutes or days, and the
 * browser leaves the page, so files held in memory are gone. The
 * alternative is uploading them anonymously to R2 and sweeping up whatever
 * never gets claimed, which means an unauthenticated write endpoint and a
 * cleanup job. Not worth it for one optional field: the typing is the part
 * worth protecting, and that survives in the draft below.
 *
 * The draft is `localStorage`, deliberately, because it has to survive the
 * round trip through signup and the confirmation email. It holds text
 * fields only, no files and nothing sensitive, and is cleared on success.
 * localStorage can throw in a private window, so every access is guarded
 * and the form still works when it does.
 */
export default function ToolSubmitForm({
  loggedIn,
  categories,
  checkout,
  priceLabel,
}: {
  loggedIn: boolean;
  categories: Category[];
  checkout: SubmitCheckout | null;
  /** The paid tier fee as text, e.g. "$5". Comes from the console setting
   * via the page, so no copy in here hardcodes the number. */
  priceLabel: string;
}) {
  const [step, setStep] = useState<"link" | "details" | "tier" | "account" | "assets">("link");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [restored, setRestored] = useState(false);

  const [looking, setLooking] = useState(false);
  const [lookupNote, setLookupNote] = useState("");

  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [submitted, setSubmitted] = useState<{ id: number; name: string; tier: "free" | "paid" } | null>(null);
  /** Their own earlier listing, when submitting turned out to be a repeat
   * of one already in the system. Not an error state: it is usually an
   * unfinished payment, so this screen offers to finish it. */
  const [already, setAlready] = useState<{
    id: number;
    name: string;
    status: string;
    listing_tier: "free" | "paid";
    paid: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const handleToken = useCallback((t: string) => setTurnstileToken(t), []);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }));

  // Restore once on mount, then land the person where they left off. Coming
  // back from signup with a filled draft, the useful place is the step they
  // were sent away from, not the top of the form again.
  //
  // react-hooks/set-state-in-effect is disabled here rather than worked
  // around. The rule is right that an effect is usually the wrong place to
  // set state, but this page is server rendered and localStorage does not
  // exist on the server, so the draft cannot be read during render without
  // a hydration mismatch. Reading it after mount and setting state once is
  // the behaviour React itself prescribes for browser-only storage. It runs
  // a single time: `restored` is the guard, and nothing below writes back
  // until it is true.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let saved: Draft | null = null;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) saved = { ...EMPTY, ...(JSON.parse(raw) as Partial<Draft>) };
    } catch {
      // unreadable or blocked storage is not an error worth showing
    }
    if (saved?.website_url) {
      setDraft(saved);
      setStep(saved.name ? (loggedIn ? "assets" : "account") : "details");
    }
    setRestored(true);
  }, [loggedIn]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Only after the restore, or the first render would overwrite the saved
  // draft with an empty one.
  useEffect(() => {
    if (!restored) return;
    try {
      if (draft.website_url) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // private window, or storage full: typing just will not survive a reload
    }
  }, [draft, restored]);

  function clearDraft() {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      // nothing to clean up if it was never written
    }
  }

  async function lookUp(event: React.FormEvent) {
    event.preventDefault();
    const typed = draft.website_url.trim();
    if (!typed) return;
    // Changing the link means a different tool, so whatever we read off the
    // last one has to go. Without this, pasting a second URL re-fetched the
    // new page and then threw the result away, because every field below
    // was filled by the first one and the merge preferred what was already
    // there. The result looked like the fetch had failed and quietly
    // submitted the wrong tool's name and description.
    const sameTool = typed === draft.looked_up;
    setLooking(true);
    setError("");
    setLookupNote("");
    try {
      const res = await fetch("/api/directory/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: typed }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setDraft((previous) => ({
          ...previous,
          website_url: body.url || typed,
          looked_up: typed,
          image: body.image || "",
          // Only a repeat lookup of the same link keeps what they typed:
          // a person coming back to this step edited those on purpose.
          name: sameTool ? previous.name || body.name || "" : body.name || "",
          tagline: sameTool ? previous.tagline || body.tagline || "" : body.tagline || "",
          description: sameTool ? previous.description || body.description || "" : body.description || "",
        }));
        if (!sameTool) setScreenshots([]);
        if (!body.name && !body.description) {
          setLookupNote("We could not find much on that page, so fill these in yourself.");
        }
      } else {
        // A site that blocks us is not a reason to stop. Carry on by hand,
        // but still treat it as a new tool if the link changed.
        setDraft((previous) => ({
          ...previous,
          website_url: body.url || typed,
          looked_up: typed,
          ...(sameTool ? {} : { image: "", name: "", tagline: "", description: "" }),
        }));
        if (!sameTool) setScreenshots([]);
        setLookupNote(`${body.error || "We could not read that page."} You can still fill this in yourself.`);
      }
      setStep("details");
    } catch {
      setDraft((previous) => ({
        ...previous,
        looked_up: typed,
        ...(sameTool ? {} : { image: "", name: "", tagline: "", description: "" }),
      }));
      if (!sameTool) setScreenshots([]);
      setLookupNote("We could not reach that page. You can still fill this in yourself.");
      setStep("details");
    } finally {
      setLooking(false);
    }
  }

  /** Pulls the sharing image off their own page so the common case needs no
   * file picker. Only offered once, and only here, because it writes to R2
   * and that needs the session the account step just established. */
  async function useFoundImage() {
    if (!draft.image) return;
    setUploading(true);
    setError("");
    try {
      const res = await fetch("/api/directory/screenshot-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: draft.image }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "We could not use that image.");
      setScreenshots((prev) => [...prev, body.url]);
      set("image", "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "We could not use that image.");
      // Clear it either way: offering a button that just failed is worse
      // than not offering it, and they can still upload a file.
      set("image", "");
    } finally {
      setUploading(false);
    }
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/directory/screenshot-upload", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Upload failed.");
      setScreenshots((prev) => [...prev, body.url]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    try {
      const res = await fetch("/api/directory/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, screenshots, turnstileToken }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body.existing) {
        // The listing is already there. Clear the draft, because keeping it
        // would send them back round the same loop, and show them the
        // listing instead.
        clearDraft();
        setAlready(body.existing);
        setStatus("idle");
        return;
      }
      if (!res.ok) throw new Error(body.error || "Something went wrong.");
      trackEvent("tool_submitted", {
        category_id: draft.category_id,
        pricing_type: draft.pricing_type,
        listing_tier: draft.listing_tier,
        has_screenshot: screenshots.length > 0,
      });
      clearDraft();
      setSubmitted({
        id: Number(body.tool?.id),
        name: draft.name,
        tier: draft.listing_tier,
      });
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (already) {
    const owesPayment =
      already.listing_tier === "paid" &&
      !already.paid &&
      (already.status === "pending" || already.status === "approved_unpaid");
    return (
      <div className="rounded-2xl border border-line p-6 text-center sm:p-8">
        <p className="font-display text-lg font-semibold">
          {already.name} is already submitted
        </p>
        {owesPayment ? (
          <>
            <p className="mt-2 text-sm text-ink-soft">
              We kept it. The only thing outstanding is the one-time {priceLabel} fee, so there is
              no need to fill the form in again.
            </p>
            {checkout?.method ? (
              <div className="mt-6 flex flex-col items-center">
                <DirectoryListingCheckout
                  toolId={already.id}
                  toolName={already.name}
                  method={checkout.method}
                  amount={checkout.amount}
                  currency={checkout.currency}
                  quote={null}
                  razorpayKeyId={checkout.razorpayKeyId}
                  paypalClientId={checkout.paypalClientId}
                  name={checkout.name}
                  email={checkout.email}
                  phone={checkout.phone}
                />
              </div>
            ) : (
              <p className="mt-4 text-sm text-ink-soft">
                Online payment is not available right now. Contact us and we will finish it for you.
              </p>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-ink-soft">
            {already.status === "changes_requested"
              ? "We asked for some changes before it can go live. Open it below and send them to us."
              : "It is in the review queue and we will email you about it. Nothing else to do."}
          </p>
        )}
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href={already.status === "changes_requested" ? `/account/tools/${already.id}` : "/account/tools"}
            className="rounded-full border border-ink/15 px-6 py-3 text-sm font-medium hover:opacity-80"
          >
            {already.status === "changes_requested" ? "Make the changes" : "Open My tools"}
          </Link>
          <button
            type="button"
            onClick={() => {
              setAlready(null);
              setDraft(EMPTY);
              setScreenshots([]);
              setStep("link");
            }}
            className="rounded-full px-6 py-3 text-sm font-medium text-ink-soft hover:text-ink"
          >
            Submit a different tool
          </button>
        </div>
      </div>
    );
  }

  if (status === "done" && submitted) {
    const payable =
      submitted.tier === "paid" && Number.isInteger(submitted.id) && checkout && checkout.method;
    return (
      <div className="rounded-2xl border border-line p-6 text-center sm:p-8">
        <p className="font-display text-lg font-semibold">Thanks, it&apos;s in.</p>
        {payable ? (
          <>
            <p className="mt-2 text-sm text-ink-soft">
              One step left: the one-time listing fee. Pay it now and{" "}
              <span className="font-medium text-ink">{submitted.name}</span> goes to the front of the
              review queue, usually looked at within two working days. If we cannot list it, we
              refund you in full.
            </p>
            <div className="mt-6 flex flex-col items-center">
              <DirectoryListingCheckout
                toolId={submitted.id}
                toolName={submitted.name}
                method={checkout.method as "razorpay" | "paypal"}
                amount={checkout.amount}
                currency={checkout.currency}
                quote={null}
                razorpayKeyId={checkout.razorpayKeyId}
                paypalClientId={checkout.paypalClientId}
                name={checkout.name}
                email={checkout.email}
                phone={checkout.phone}
              />
            </div>
            <Link
              href="/account/tools"
              className="mt-6 inline-block text-xs font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
            >
              Pay later from My tools
            </Link>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-ink-soft">
              {submitted.tier === "paid"
                ? "We'll review it and email you a payment link. Nothing is charged until you pay it."
                : "We'll review it and email you when it's live, or if we need any changes."}
            </p>
            <Link
              href="/account/tools"
              className="mt-5 inline-block rounded-full border border-ink/15 px-6 py-3 text-sm font-medium hover:opacity-80"
            >
              Track it in My tools
            </Link>
          </>
        )}
      </div>
    );
  }

  const categoryOptions = categories.map((c) => ({ value: String(c.id), label: c.name }));
  const tiers = tiersFor(priceLabel);
  const inputClass =
    "mt-2 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink";
  const detailsReady = Boolean(draft.name.trim() && draft.category_id);
  const stepIndex = STEPS.findIndex((s) => s.key === (step === "account" ? "tier" : step));

  const progress = (
    <ol className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
      {STEPS.map((s, index) => (
        <li key={s.key} className="flex items-center gap-2">
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
              index <= stepIndex ? "bg-ink text-paper" : "border border-line text-ink-soft"
            }`}
          >
            {index + 1}
          </span>
          <span className={index <= stepIndex ? "font-medium" : "text-ink-soft"}>{s.label}</span>
          {index < STEPS.length - 1 && <span aria-hidden="true" className="text-ink-soft/50">·</span>}
        </li>
      ))}
    </ol>
  );

  if (step === "link") {
    return (
      <div>
        <form onSubmit={lookUp} className="rounded-2xl border border-line p-6 sm:p-8">
          {progress}
          <label className="text-sm font-medium" htmlFor="website_url">
            Your tool&apos;s web address
          </label>
          <input
            id="website_url"
            name="website_url"
            type="text"
            inputMode="url"
            required
            autoFocus
            placeholder="yourtool.com"
            value={draft.website_url}
            onChange={(event) => set("website_url", event.target.value)}
            className={inputClass}
          />
          <p className="mt-2 text-xs text-ink-soft">
            We&apos;ll read the page and fill in what we can. You can change all of it. No account needed yet.
          </p>
          <button
            type="submit"
            disabled={looking || !draft.website_url.trim()}
            className="mt-5 w-full rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {looking ? "Reading your page..." : "Continue"}
          </button>
        </form>

        {/* The guide sits directly under the box, not on a separate page.
            The owner's point was that somebody pasting a link has no idea
            what happens next, what it costs, or what we will do with it,
            and finding that out should not require them to continue first. */}
        <div className="mt-6 rounded-2xl border border-line bg-paper-soft p-6 sm:p-8">
          <h2 className="font-display text-lg font-semibold">What happens after you paste it</h2>
          <ol className="mt-4 space-y-4">
            {[
              {
                title: "We read your page",
                body: "Your name, tagline and description come back pre-filled from your own site. Nothing is saved yet, and you can rewrite every word of it.",
              },
              {
                title: "You check the details and pick a category",
                body: "Category and pricing decide which page your listing sits on and which filters find it. Get these right and the listing does more work for you.",
              },
              {
                title: "You choose free or paid",
                body: `Free needs our badge somewhere on your site, which we check for. Paid is ${priceLabel} once, needs no badge, and is reviewed first. Both are nofollow links.`,
              },
              {
                title: "You make an account, if you don't have one",
                body: "It is how you track the listing and ask for edits later. One account covers the courses, the community and the directory. Your typing is saved while you do it.",
              },
              {
                title: "You add screenshots and submit",
                body: "Optional, up to four, and we can lift the sharing image off your page for you. Then it goes into the review queue.",
              },
              {
                title: "A human reviews it",
                body: "Every listing, free or paid, is checked by hand. We email you when it is live, or tell you exactly what needs changing. Paid submissions are looked at first and refunded in full if we cannot list them.",
              },
            ].map((item, index) => (
              <li key={item.title} className="flex gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-paper">
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-1 text-sm leading-6 text-ink-soft">{item.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-6 border-t border-line pt-5">
            <h3 className="text-sm font-medium">The rules, plainly</h3>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-ink-soft">
              <li>
                Submit a tool you own or work on. We decline affiliate pages, resold white-label
                clones, and listings for somebody else&apos;s product.
              </li>
              <li>
                It has to work and be reachable. A waitlist page with no product behind it is not a
                listing yet.
              </li>
              <li>
                Every outbound link on a listing is <span className="font-medium text-ink">nofollow</span>,
                free or paid. You are getting the listing and the visitors, not a ranking signal.
                Anyone selling you a dofollow directory link is selling what Google calls a link
                scheme.
              </li>
              <li>
                We may edit your copy for length, fix the tagline, and add our own screenshots. We
                will not change what your product does.
              </li>
              <li>
                You can ask for an edit or ask us to remove the listing at any time, from your
                account.
              </li>
              <li>
                Paying does not buy a listing or a position. If we decline it, you get the full{" "}
                {priceLabel} back.
              </li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (step === "details") {
    return (
      <div className="space-y-5 rounded-2xl border border-line p-6 sm:p-8">
        {progress}
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-display text-lg font-semibold">Check the details</p>
          <button
            type="button"
            onClick={() => setStep("link")}
            className="text-xs font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
          >
            Change link
          </button>
        </div>
        <p className="break-all text-xs text-ink-soft">Read from {draft.website_url}</p>
        {lookupNote && <p className="text-sm text-ink-soft">{lookupNote}</p>}

        <div>
          <label className="text-sm font-medium" htmlFor="name">
            Tool name
          </label>
          <input
            id="name"
            type="text"
            required
            value={draft.name}
            onChange={(event) => set("name", event.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="tagline">
            Tagline
          </label>
          <input
            id="tagline"
            type="text"
            value={draft.tagline}
            onChange={(event) => set("tagline", event.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="description">
            Description
          </label>
          <textarea
            id="description"
            rows={5}
            value={draft.description}
            onChange={(event) => set("description", event.target.value)}
            className={inputClass}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm font-medium">Category</p>
            <div className="mt-2">
              <BrandSelect
                value={draft.category_id}
                onChange={(value) => set("category_id", value)}
                options={categoryOptions}
                placeholder="Choose a category"
                searchable
                searchPlaceholder="Search categories…"
              />
            </div>
          </div>
          <div>
            <p className="text-sm font-medium">Pricing</p>
            <div className="mt-2">
              <BrandSelect
                value={draft.pricing_type}
                onChange={(value) => set("pricing_type", value)}
                options={PRICING_OPTIONS}
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={!detailsReady}
          onClick={() => setStep("tier")}
          className="w-full rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    );
  }

  if (step === "tier") {
    return (
      <div className="rounded-2xl border border-line p-6 sm:p-8">
        {progress}
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-display text-lg font-semibold">How do you want it listed?</p>
          <button
            type="button"
            onClick={() => setStep("details")}
            className="text-xs font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
          >
            Back
          </button>
        </div>
        <p className="mt-2 text-sm text-ink-soft">
          Both tiers get the same listing page, the same filters and the same hand review. The
          difference is what you give us in exchange and how fast it moves.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {tiers.map((tier) => {
            const active = draft.listing_tier === tier.value;
            return (
              <button
                key={tier.value}
                type="button"
                onClick={() => set("listing_tier", tier.value)}
                aria-pressed={active}
                className={`flex h-full flex-col rounded-2xl border p-5 text-left transition-colors ${
                  active ? "border-ink bg-paper-soft" : "border-line hover:border-ink/40"
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-display text-base font-semibold">{tier.title}</p>
                  <span className="shrink-0 text-sm font-medium">{tier.price}</span>
                </div>
                <p className="mt-1.5 text-sm leading-6 text-ink-soft">{tier.summary}</p>
                <ul className="mt-4 space-y-2 text-sm leading-6">
                  {tier.includes.map((line) => (
                    <li key={line} className="flex gap-2">
                      <span aria-hidden="true" className="mt-0.5 shrink-0 font-medium">
                        &#10003;
                      </span>
                      <span>{line}</span>
                    </li>
                  ))}
                  {tier.costs.map((line) => (
                    <li key={line} className="flex gap-2 text-ink-soft">
                      <span aria-hidden="true" className="mt-0.5 shrink-0">
                        &minus;
                      </span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
                <span
                  className={`mt-5 rounded-full px-4 py-2 text-center text-xs font-medium ${
                    active ? "bg-ink text-paper" : "border border-line text-ink-soft"
                  }`}
                >
                  {active ? "Selected" : "Choose this"}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-4 text-xs leading-6 text-ink-soft">
          Links on listings are nofollow either way. You are buying the listing and the visitors, not
          a ranking signal, and anyone promising otherwise is selling you something Google treats as
          a link scheme. Paid listings are refunded in full if we cannot list them.
        </p>

        <button
          type="button"
          onClick={() => setStep(loggedIn ? "assets" : "account")}
          className="mt-6 w-full rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80"
        >
          Continue with the {draft.listing_tier === "paid" ? `${priceLabel} paid` : "free"} listing
        </button>
      </div>
    );
  }

  if (step === "account") {
    const back = encodeURIComponent("/tools/submit");
    return (
      <div className="rounded-2xl border border-line p-6 text-center sm:p-8">
        <p className="font-display text-lg font-semibold">Almost there</p>
        <p className="mt-2 text-sm text-ink-soft">
          Your listing for <span className="font-medium text-ink">{draft.name}</span> is saved in this
          browser. Create an account or log in and we&apos;ll bring you straight back to finish it.
        </p>
        <p className="mt-2 text-xs text-ink-soft">
          The account is how you track the listing and edit it later. One account covers courses,
          community and the directory.
        </p>
        <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href={`/signup?redirect=${back}`}
            className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80"
          >
            Create an account
          </Link>
          <Link
            href={`/login?redirect=${back}`}
            className="rounded-full border border-ink/15 px-6 py-3 text-sm font-medium transition-opacity hover:opacity-80"
          >
            I already have one
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setStep("tier")}
          className="mt-4 text-xs font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
        >
          Back to listing type
        </button>
      </div>
    );
  }

  const selectedTier = tiers.find((t) => t.value === draft.listing_tier);

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-line p-6 sm:p-8">
      {progress}
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-lg font-semibold">Images and submit</p>
        <button
          type="button"
          onClick={() => setStep("details")}
          className="text-xs font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
        >
          Edit details
        </button>
      </div>

      <div className="rounded-xl border border-line bg-paper-soft p-4 text-sm">
        <p className="font-medium">{draft.name}</p>
        {draft.tagline && <p className="mt-1 text-ink-soft">{draft.tagline}</p>}
        <p className="mt-1 break-all text-xs text-ink-soft">{draft.website_url}</p>
        <p className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-ink px-2.5 py-1 font-medium text-paper">
            {selectedTier?.title} · {selectedTier?.price}
          </span>
          <button
            type="button"
            onClick={() => setStep("tier")}
            className="font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
          >
            Change
          </button>
        </p>
      </div>

      <div>
        <p className="text-sm font-medium">Screenshots (optional, up to {MAX_SCREENSHOTS})</p>
        <p className="mt-1 text-xs text-ink-soft">
          A listing with a screenshot gets clicked more. We fetch your logo ourselves, so this is
          the product itself: a dashboard, the editor, the result it produces.
        </p>
        {draft.image && screenshots.length < MAX_SCREENSHOTS && (
          <button
            type="button"
            onClick={useFoundImage}
            disabled={uploading}
            className="mt-3 w-full rounded-lg border border-dashed border-line px-4 py-2.5 text-sm text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
          >
            {uploading ? "Fetching..." : "Use the image from your page"}
          </button>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {screenshots.map((s, i) => (
            <div key={s} className="relative">
              <SafeImage
                src={s}
                alt={`${draft.name || "Tool"} screenshot ${i + 1}`}
                width={64}
                height={64}
                className="h-16 w-16 rounded-md border border-line object-cover"
              />
              <button
                type="button"
                onClick={() => setScreenshots((arr) => arr.filter((_, idx) => idx !== i))}
                aria-label={`Remove screenshot ${i + 1}`}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-xs text-paper"
              >
                &times;
              </button>
            </div>
          ))}
          {screenshots.length < MAX_SCREENSHOTS && (
            <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-md border border-dashed border-line text-xs text-ink-soft hover:border-ink">
              {uploading ? "..." : "+"}
              <span className="sr-only">Upload a screenshot</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageChange}
                disabled={uploading}
              />
            </label>
          )}
        </div>
      </div>

      <Turnstile onToken={handleToken} />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={status === "submitting" || !detailsReady || !turnstileToken}
        className="w-full rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {status === "submitting"
          ? "Submitting..."
          : draft.listing_tier === "paid"
          ? "Submit and pay"
          : "Submit for review"}
      </button>
      {draft.listing_tier === "paid" && (
        <p className="text-center text-xs text-ink-soft">
          Nothing is charged yet. Checkout opens on the next screen.
        </p>
      )}
    </form>
  );
}

/** The two tiers, in the words the owner uses for them. `includes` is what
 * you get, `costs` is what it asks of you, and both lists are shown so the
 * free tier does not look strictly worse than it is. */
const tiersFor = (priceLabel: string) => [
  {
    value: "free" as const,
    title: "Free listing",
    price: "$0",
    summary: "You link back to us, we list you.",
    includes: [
      "Your own listing page with logo, screenshots and description",
      "Found by search, category and pricing filters",
      "Listed in the category page and the sitemap",
      "Edit requests any time from your account",
    ],
    costs: [
      "Our badge has to stay on your site, and we check for it",
      "Reviewed in the normal queue, up to 14 days",
    ],
  },
  {
    value: "paid" as const,
    title: "Paid listing",
    price: `${priceLabel} once`,
    summary: "No badge, no link back, reviewed first.",
    includes: [
      "Everything in the free listing",
      "Nothing to add to your site, no badge, no link back",
      "Reviewed before the free queue, usually within two working days",
      "Payment receipt in your account for your books",
      "Refunded in full if we cannot list it",
    ],
    costs: [`One-time ${priceLabel} fee, no renewal, no subscription`],
  },
];
