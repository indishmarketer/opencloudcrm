"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConsoleModal from "@/components/ConsoleModal";

export default function WhatsAppAddNumberModal({ wabaId }: { wabaId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");

  const managerUrl = wabaId
    ? `https://business.facebook.com/wa/manage/phone-numbers/?waba_id=${encodeURIComponent(wabaId)}`
    : "https://business.facebook.com/wa/manage/phone-numbers/";

  function handleSync() {
    setSyncing(true);
    setMessage("");
    router.refresh();
    setTimeout(() => {
      setSyncing(false);
      setMessage("List refreshed! Any verified numbers in WhatsApp Manager will now show below.");
    }, 600);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMessage("");
          setOpen(true);
        }}
        className="rounded-full border border-line px-4 py-2 text-xs font-medium transition-colors hover:border-ink"
      >
        Add a number
      </button>

      {open && (
        <ConsoleModal title="Add a WhatsApp number" onClose={() => setOpen(false)}>
          <div className="space-y-4">
            <p className="text-sm text-ink-soft leading-relaxed">
              Meta requires numbers for your WhatsApp Business Account to be added and verified directly inside
              Meta WhatsApp Manager. Once added and verified there, click <strong>Sync numbers</strong> below to
              see them immediately.
            </p>

            <div className="rounded-xl border border-line bg-paper-soft p-4 space-y-2.5 text-xs text-ink-soft">
              <p className="font-semibold text-ink text-sm">4 quick steps to add a number:</p>
              <ol className="list-decimal pl-4 space-y-2 leading-5">
                <li>
                  Open{" "}
                  <a
                    href={managerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-ink underline"
                  >
                    Meta WhatsApp Manager ↗
                  </a>{" "}
                  and click <strong>Add Phone Number</strong>.
                </li>
                <li>Enter your display name and phone number, then complete the SMS or voice verification.</li>
                <li>Return here and click <strong>Sync numbers</strong> below to display the number here.</li>
                <li>
                  It will show as <strong>Pending</strong> until one more step: click the <strong>Register</strong>{" "}
                  button that appears on it and set a PIN. Meta Manager does not do this step for you -- the number
                  cannot send or receive anything until it does.
                </li>
              </ol>
            </div>

            {message && (
              <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-xs text-green-700">
                {message}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-line">
              <a
                href={managerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80 inline-flex items-center gap-1.5"
              >
                Open Meta WhatsApp Manager ↗
              </a>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSync}
                  disabled={syncing}
                  className="rounded-full border border-line px-4 py-2.5 text-sm font-medium transition-colors hover:border-ink disabled:opacity-50"
                >
                  {syncing ? "Syncing…" : "Sync numbers"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-line px-4 py-2.5 text-sm font-medium transition-colors hover:border-ink"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </ConsoleModal>
      )}
    </>
  );
}
