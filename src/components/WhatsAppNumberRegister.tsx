"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConsoleModal from "@/components/ConsoleModal";

/** The step Meta's own WhatsApp Manager does not do for you when a business
 * manages its own WABA directly: adding a number there and passing SMS/voice
 * verification only proves you own the number. It stays "Pending" -- unable
 * to send or receive anything -- until this separate Cloud API call runs,
 * setting the number's two-step verification PIN in the same step. There is
 * no UI for this inside Meta WhatsApp Manager for a self-managed WABA; it is
 * API-only, which is exactly what the "Pending" tooltip there says. */
export default function WhatsAppNumberRegister({
  phoneNumberId,
  displayNumber,
}: {
  phoneNumberId: string;
  displayNumber: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/console/whatsapp/numbers/${phoneNumberId}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not register that number.");
      setDone(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not register that number.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setPin("");
          setError("");
          setDone(false);
          setOpen(true);
        }}
        className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper transition-opacity hover:opacity-80"
      >
        Register
      </button>
      {open && (
        <ConsoleModal title={`Register ${displayNumber}`} onClose={() => setOpen(false)}>
          {!done ? (
            <form onSubmit={submit} className="space-y-4">
              <p className="text-sm text-ink-soft leading-relaxed">
                This number verified ownership in Meta WhatsApp Manager, but is still sitting at <strong>Pending</strong> --
                a separate step Meta does not do for you there. Set a 6-digit PIN below (this becomes the number&apos;s
                two-step verification PIN, so remember it) and it should move to Connected immediately.
              </p>
              <div>
                <label className="text-sm font-medium" htmlFor={`pin-${phoneNumberId}`}>6-digit PIN</label>
                <input
                  id={`pin-${phoneNumberId}`}
                  name="pin"
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  className="mt-2 w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm tracking-widest outline-none focus:border-ink"
                />
                <p className="mt-1 text-xs text-ink-soft">
                  If this number already has a PIN from before, it has to match -- Meta rejects a mismatch rather than
                  resetting it.
                </p>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-line px-5 py-2.5 text-sm font-medium transition-colors hover:border-ink"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={saving || pin.length !== 6}
                  className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
                >
                  {saving ? "Registering…" : "Register"}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-green-700">
                Registered. {displayNumber} can now send and receive -- refresh if the status above does not update
                within a few seconds.
              </p>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </ConsoleModal>
      )}
    </>
  );
}
