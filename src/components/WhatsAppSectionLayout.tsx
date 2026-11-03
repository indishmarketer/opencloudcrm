"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import WhatsAppSectionTabs from "@/components/WhatsAppSectionTabs";

export default function WhatsAppSectionLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isConversation = /^\/console\/whatsapp\/messages\/[^/]+/.test(pathname);

  if (isConversation) return <>{children}</>;

  return (
    <>
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">WhatsApp</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink-soft">
        Templates are the approved messages the site can send. Messages is every conversation, with its delivery
        status. Campaigns send one approved template to a list of people who opted in. Automation shows the
        flows that fire on their own. Reports shows what was delivered and read. Numbers shows the sending numbers
        and how many messages a day each is allowed. Cost is what Meta actually billed.
      </p>
      <div className="mt-6"><WhatsAppSectionTabs /></div>
      <div className="mt-8">{children}</div>
    </>
  );
}
