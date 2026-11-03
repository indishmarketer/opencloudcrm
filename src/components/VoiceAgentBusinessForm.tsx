"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import BrandSelect from "@/components/BrandSelect";
import {
  BUSINESS_CATEGORIES,
  type VoiceAgentBusinessProfile,
} from "@/lib/voiceAgentBusiness";
import { SITE_NAME } from "@/config/brand";

const EMPTY_PROFILE: VoiceAgentBusinessProfile = {
  company: "",
  role: "",
  website: "",
  category: "",
};

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

export default function VoiceAgentBusinessForm() {
  const [state, setState] = useState<"loading" | "guest" | "authenticated">("loading");
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [hasSavedProfile, setHasSavedProfile] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    fetch("/api/voice-agent/business-info", { cache: "no-store" })
      .then(async (response) => {
        if (!active) return;
        if (response.status === 401) {
          setState("guest");
          return;
        }
        if (!response.ok) throw new Error("Could not load your profile.");

        const data = (await readJson(response)) as {
          profile: VoiceAgentBusinessProfile | null;
        };
        if (data.profile) {
          setProfile(data.profile);
          setHasSavedProfile(true);
        }
        setState("authenticated");
      })
      .catch(() => {
        if (!active) return;
        setState("authenticated");
        setMessage("We could not load your details. You can still fill them in below.");
      });

    return () => {
      active = false;
    };
  }, []);

  function updateField(field: keyof VoiceAgentBusinessProfile, value: string) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    // Business category is no longer a native <select>, so the browser's
    // own "please fill this out" validation no longer covers it.
    if (!profile.category) {
      setMessage("Choose a business category.");
      return;
    }
    setSaving(true);

    try {
      const response = await fetch("/api/voice-agent/business-info", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = (await readJson(response)) as {
        error?: string;
        profile?: VoiceAgentBusinessProfile;
      };

      if (!response.ok || !data.profile) {
        throw new Error(data.error || "Could not save your details.");
      }

      setProfile(data.profile);
      setHasSavedProfile(true);
      setMessage("Saved. Your account is ready for the five-minute voice demo.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save your details.");
    } finally {
      setSaving(false);
    }
  }

  if (state === "loading") {
    return (
      <div className="rounded-[2rem] border border-line bg-paper p-8" aria-live="polite">
        <p className="text-sm font-semibold text-ink-soft">Checking your account…</p>
      </div>
    );
  }

  if (state === "guest") {
    return (
      <div className="rounded-[2rem] border border-line bg-ink p-8 text-paper sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-paper/55">
          Five minutes, free
        </p>
        <h3 className="mt-4 text-3xl font-semibold tracking-tight">
          Create an account, then tell the agent who it is speaking for.
        </h3>
        <p className="mt-4 max-w-2xl text-paper/70">
          No card. Four short business fields. Your details stay attached to your
          {" "}{SITE_NAME} account for future demos.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/signup?redirect=%2Fproducts%2Fvoice-agent%23try-free"
            className="rounded-full bg-paper px-6 py-3 text-sm font-semibold text-ink transition hover:bg-paper-soft"
          >
            Create account & try free
          </Link>
          <Link
            href="/login?redirect=%2Fproducts%2Fvoice-agent%23try-free"
            className="rounded-full border border-paper/30 px-6 py-3 text-sm font-semibold text-paper transition hover:border-paper"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-[2rem] border border-line bg-paper p-8 shadow-[0_24px_70px_rgba(0,0,0,0.08)] sm:p-10"
    >
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink-soft">
          {hasSavedProfile ? "Your demo profile" : "One quick setup"}
        </p>
        <h3 className="mt-3 text-3xl font-semibold tracking-tight text-ink">
          Help the voice agent sound relevant from hello.
        </h3>
        <p className="mt-3 text-ink-soft">
          This is deliberately short. You can update these details whenever your
          business changes.
        </p>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold text-ink">
          Company
          <input
            required
            maxLength={120}
            value={profile.company}
            onChange={(event) => updateField("company", event.target.value)}
            placeholder="Acme Studio"
            className="rounded-xl border border-line bg-paper-soft px-4 py-3 font-normal outline-none transition focus:border-ink"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-ink">
          Your role
          <input
            required
            maxLength={120}
            value={profile.role}
            onChange={(event) => updateField("role", event.target.value)}
            placeholder="Founder"
            className="rounded-xl border border-line bg-paper-soft px-4 py-3 font-normal outline-none transition focus:border-ink"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-ink">
          Website <span className="font-normal text-ink-soft">(optional)</span>
          <input
            inputMode="url"
            maxLength={300}
            value={profile.website}
            onChange={(event) => updateField("website", event.target.value)}
            placeholder="example.com"
            className="rounded-xl border border-line bg-paper-soft px-4 py-3 font-normal outline-none transition focus:border-ink"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-ink">
          Business category
          <BrandSelect
            value={profile.category}
            onChange={(value) => updateField("category", value)}
            placeholder="Choose a category"
            options={BUSINESS_CATEGORIES.map((category) => ({ value: category.value, label: category.label }))}
          />
        </label>
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-paper transition hover:bg-ink/85 disabled:cursor-wait disabled:opacity-60"
        >
          {saving ? "Saving…" : hasSavedProfile ? "Update details" : "Save & continue"}
        </button>
        {hasSavedProfile ? (
          <Link
            href="/account/voice-agent"
            className="rounded-full border border-ink px-6 py-3 text-sm font-semibold text-ink transition hover:bg-ink hover:text-paper"
          >
            Try the demo call
          </Link>
        ) : null}
        <p className="text-sm text-ink-soft" aria-live="polite">
          {message}
        </p>
      </div>
    </form>
  );
}
