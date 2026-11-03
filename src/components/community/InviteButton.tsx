"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import InviteModal from "@/components/community/InviteModal";

export default function InviteButton({
  username,
  isLoggedIn = false,
  className,
}: {
  username?: string | null;
  isLoggedIn?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function handleClick() {
    if (!isLoggedIn) {
      router.push("/login?redirect=/community/general");
      return;
    }
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={
          className ||
          "w-full flex items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-85"
        }
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
        <span>Invite Friends</span>
      </button>

      <InviteModal username={username} isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
