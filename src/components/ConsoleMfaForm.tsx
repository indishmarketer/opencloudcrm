"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Code entry for console 2-step login. In setup mode a correct code also
 * returns recovery codes, shown once before continuing. */
export default function ConsoleMfaForm({ mode }: { mode: "setup" | "verify" }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [error, setError] = useState("");
  const [restart, setRestart] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    const res = await fetch("/api/console/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    setStatus("idle");
    if (!res?.ok) {
      setError(body?.error || "Something went wrong. Try again.");
      setRestart(!!body?.restart);
      return;
    }
    if (Array.isArray(body.recoveryCodes)) {
      setRecoveryCodes(body.recoveryCodes);
      return;
    }
    router.replace("/console");
  }

  if (recoveryCodes) {
    return (
      <div className="mt-6">
        <p className="font-medium">2-step login is on.</p>
        <p className="mt-2 text-sm text-ink-soft">
          Save these recovery codes somewhere safe, like your password manager. Each one works once if you lose your phone. They won&apos;t be shown again.
        </p>
        <ul className="mt-4 grid select-all grid-cols-2 gap-2 rounded-xl border border-line bg-paper p-4 font-mono text-sm">
          {recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-0.5" />
          <span>I&apos;ve saved my recovery codes</span>
        </label>
        <button
          type="button"
          disabled={!saved}
          onClick={() => router.replace("/console")}
          className="mt-4 w-full rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-40"
        >
          Continue to the console
        </button>
      </div>
    );
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={submit}>
      <input
        name="code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        inputMode={useRecovery ? "text" : "numeric"}
        autoComplete="one-time-code"
        placeholder={useRecovery ? "abcd-1234" : "123456"}
        aria-label={useRecovery ? "Recovery code" : "6-digit code"}
        maxLength={useRecovery ? 12 : 7}
        required
        autoFocus
        className="w-full rounded-lg border border-line bg-paper px-4 py-3 text-center font-mono text-lg tracking-widest outline-none focus:border-ink"
      />
      {error && (
        <p className="text-sm text-red-600">
          {error}
          {restart && (
            <>
              {" "}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full reload back to login after a session/MFA error, not a Link; the catch-all src/app/[...slug]/page.tsx makes the linter think every path is a page */}
              <a href="/console/login" className="underline">Back to login</a>
            </>
          )}
        </p>
      )}
      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {status === "submitting" ? "Checking…" : mode === "setup" ? "Turn on 2-step login" : "Sign in"}
      </button>
      {mode === "verify" && (
        <button
          type="button"
          onClick={() => {
            setUseRecovery((v) => !v);
            setCode("");
            setError("");
          }}
          className="w-full text-center text-sm text-ink-soft underline"
        >
          {useRecovery ? "Use the authenticator app instead" : "Lost your phone? Use a recovery code"}
        </button>
      )}
    </form>
  );
}
