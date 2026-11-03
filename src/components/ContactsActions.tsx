"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ConsoleModal from "@/components/ConsoleModal";
import ImportContactsModal from "@/components/ImportContactsModal";

const EXPORT_HREF = `/api/console/contacts/export`;

export default function ContactsActions() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<"create" | "import" | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [marketing, setMarketing] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function openCreate() {
    setMenuOpen(false);
    setEmail("");
    setName("");
    setPhone("");
    setMarketing(true);
    setError("");
    setModal("create");
  }

  async function handleCreate() {
    setError("");
    setSaving(true);
    const res = await fetch("/api/console/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, phone, marketing }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) {
      router.push(`/console/contacts/c-${body.id}`);
    } else {
      setError(body.error || "Could not create this contact.");
    }
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80"
      >
        Add contacts
        <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 transition-transform ${menuOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {menuOpen && (
        <div className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-xl border border-line bg-paper shadow-lg">
          <button
            type="button"
            onClick={openCreate}
            className="block w-full px-4 py-2.5 text-left text-sm hover:bg-paper-soft"
          >
            Create contact
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setModal("import");
            }}
            className="block w-full px-4 py-2.5 text-left text-sm hover:bg-paper-soft"
          >
            Import contacts
          </button>
          <a
            href={EXPORT_HREF}
            onClick={() => setMenuOpen(false)}
            className="block w-full px-4 py-2.5 text-left text-sm hover:bg-paper-soft"
          >
            Export all contacts
          </a>
        </div>
      )}

      {modal === "create" && (
        <ConsoleModal title="Create contact" onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Optional"
                className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Phone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Optional"
                className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={marketing}
                onChange={(e) => setMarketing(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-ink"
              />
              <span>
                Subscribed to marketing emails
                <span className="block text-xs text-ink-soft">Untick if they haven&apos;t agreed to get your emails.</span>
              </span>
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving || !email.trim()}
              className="w-full rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {saving ? "Creating…" : "Create contact"}
            </button>
          </div>
        </ConsoleModal>
      )}

      {modal === "import" && (
        <ImportContactsModal
          onClose={() => setModal(null)}
          onImported={() => {
            setModal(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
