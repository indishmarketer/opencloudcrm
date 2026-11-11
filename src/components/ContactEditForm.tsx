"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConsoleModal from "@/components/ConsoleModal";
import CountrySelect from "@/components/CountrySelect";

export default function ContactEditForm({
  contactId,
  initialName,
  initialFirstName,
  initialLastName,
  initialPhone,
  initialCountry,
  initialAddress,
}: {
  contactId: number;
  initialName: string;
  initialFirstName: string;
  initialLastName: string;
  initialPhone: string;
  initialCountry: string;
  initialAddress: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [phone, setPhone] = useState(initialPhone);
  const [country, setCountry] = useState(initialCountry);
  const [address, setAddress] = useState(initialAddress);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/console/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        firstName,
        lastName,
        phone,
        address,
        ...(country !== initialCountry ? { country } : {}),
      }),
    });
    setSaving(false);
    if (res.ok) {
      setEditing(false);
      router.refresh();
    } else {
      setError("Could not save this contact.");
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setName(initialName);
          setFirstName(initialFirstName);
          setLastName(initialLastName);
          setPhone(initialPhone);
          setCountry(initialCountry);
          setAddress(initialAddress);
          setEditing(true);
        }}
        aria-label="Edit contact"
        className="rounded-full border-2 border-line px-5 py-2 text-sm font-medium text-ink transition-colors hover:border-ink"
      >
        Edit
      </button>
    );
  }

  return (
    <ConsoleModal title="Edit contact" onClose={() => setEditing(false)}>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium" htmlFor="contact-edit-name">Full name</label>
          <input
            id="contact-edit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium" htmlFor="contact-edit-first-name">First name</label>
            <input
              id="contact-edit-first-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
            />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="contact-edit-last-name">Last name</label>
            <input
              id="contact-edit-last-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
            />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="contact-edit-phone">Phone</label>
          <input
            id="contact-edit-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Country</label>
          <CountrySelect value={country} onChange={setCountry} autoDetect={false} className="mt-1 w-full" />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="contact-edit-address">Address</label>
          <textarea
            id="contact-edit-address"
            rows={2}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-full border border-line px-4 py-2 text-sm font-medium transition-colors hover:border-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </ConsoleModal>
  );
}
