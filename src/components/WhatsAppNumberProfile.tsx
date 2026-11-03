"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ConsoleModal from "@/components/ConsoleModal";

type Profile = {
  about?: string | null;
  description?: string | null;
  address?: string | null;
  email?: string | null;
  websites?: string[] | null;
  profile_picture_url?: string | null;
};

/** The profile a customer sees when they tap the business name in a chat.
 *
 * Each phone number has its own, which is why a second number looks empty
 * next to a well filled-in first one. Meta's settings only offer this for
 * some numbers, so it is editable here for all of them. */
export default function WhatsAppNumberProfile({
  phoneNumberId,
  displayNumber,
}: {
  phoneNumberId: string;
  displayNumber: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [picture, setPicture] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // Only the fetch lives here; clearing the previous state happens when the
  // button is clicked, because resetting it synchronously inside an effect
  // is a cascading render React rightly complains about.
  useEffect(() => {
    if (!open) return;
    fetch(`/api/console/whatsapp/numbers/${phoneNumberId}/profile`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not load that profile.");
        return data.profile as Profile;
      })
      .then(setProfile)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load that profile."));
  }, [open, phoneNumberId]);

  async function save(form: HTMLFormElement) {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const data = new FormData(form);
      if (picture) data.set("picture", picture);
      const res = await fetch(`/api/console/whatsapp/numbers/${phoneNumberId}/profile`, { method: "POST", body: data });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save that.");
      setProfile(body.profile as Profile);
      setPicture(null);
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that.");
    } finally {
      setSaving(false);
    }
  }

  const field = "mt-2 w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink";

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setProfile(null);
          setError("");
          setSaved(false);
          setOpen(true);
        }}
        className="rounded-full border border-line px-4 py-2 text-xs font-medium transition-colors hover:border-ink"
      >
        Edit profile
      </button>
      {open && (
        <ConsoleModal title={`Profile for ${displayNumber}`} onClose={() => setOpen(false)} wide>
          {!profile && !error && <p className="text-sm text-ink-soft">Loading…</p>}
          {profile && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save(e.currentTarget);
              }}
              className="space-y-4"
            >
              <p className="text-sm text-ink-soft">
                What someone sees when they tap your name in a chat. Each number has its own, so filling this one in
                does not change the other. A field left blank keeps whatever is already there.
              </p>

              <div className="flex flex-wrap items-center gap-4">
                {profile.profile_picture_url ? (
                  // Through our own route: Meta serves these from
                  // pps.whatsapp.net, which the site's CSP does not allow
                  // as an image source, and the URLs expire besides.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/console/whatsapp/numbers/${phoneNumberId}/profile/picture`}
                    alt={`Current WhatsApp profile picture for ${displayNumber}`}
                    className="h-16 w-16 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-paper-soft text-xs text-ink-soft">
                    None
                  </span>
                )}
                <label className="text-sm">
                  <span className="font-medium">Profile picture</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    onChange={(e) => setPicture(e.target.files?.[0] || null)}
                    className="mt-1 block text-xs text-ink-soft file:mr-3 file:rounded-full file:border file:border-line file:bg-paper file:px-3 file:py-1.5 file:text-xs file:font-medium"
                  />
                  <span className="mt-1 block text-xs text-ink-soft">
                    Square JPEG or PNG. WhatsApp shows it as a circle.
                  </span>
                </label>
              </div>

              <div>
                <label className="text-sm font-medium" htmlFor={`about-${phoneNumberId}`}>About</label>
                <input id={`about-${phoneNumberId}`} name="about" defaultValue={profile.about || ""} maxLength={139} className={field} />
                <p className="mt-1 text-xs text-ink-soft">The one line under the name. 139 characters.</p>
              </div>

              <div>
                <label className="text-sm font-medium" htmlFor={`description-${phoneNumberId}`}>Description</label>
                <textarea id={`description-${phoneNumberId}`} name="description" defaultValue={profile.description || ""} maxLength={512} rows={3} className={`${field} resize-y`} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium" htmlFor={`email-${phoneNumberId}`}>Email</label>
                  <input id={`email-${phoneNumberId}`} name="email" type="email" defaultValue={profile.email || ""} maxLength={128} className={field} />
                </div>
                <div>
                  <label className="text-sm font-medium" htmlFor={`address-${phoneNumberId}`}>Address</label>
                  <input id={`address-${phoneNumberId}`} name="address" defaultValue={profile.address || ""} maxLength={256} className={field} />
                </div>
                <div>
                  <label className="text-sm font-medium" htmlFor={`website-${phoneNumberId}`}>Website</label>
                  <input id={`website-${phoneNumberId}`} name="website" defaultValue={profile.websites?.[0] || ""} placeholder="https://" className={field} />
                </div>
                <div>
                  <label className="text-sm font-medium" htmlFor={`website2-${phoneNumberId}`}>Second website</label>
                  <input id={`website2-${phoneNumberId}`} name="website2" defaultValue={profile.websites?.[1] || ""} placeholder="https://" className={field} />
                </div>
              </div>

              {saved && <p className="text-sm text-green-700">Saved. It can take a few minutes to show in WhatsApp.</p>}
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
                  disabled={saving}
                  className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save profile"}
                </button>
              </div>
            </form>
          )}
          {error && !profile && <p className="text-sm text-red-600">{error}</p>}
        </ConsoleModal>
      )}
    </>
  );
}
