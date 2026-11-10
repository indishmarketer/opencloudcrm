import ConsoleForms from "@/components/ConsoleForms";
import { listForms } from "@/lib/forms";
import { listPages } from "@/lib/sitePages";
import type { PageBlock } from "@/lib/pageBlocks";

export const dynamic = "force-dynamic";

/** Best-effort: finds the first page with a Form block in the given mode,
 * so "Edit" can jump straight to it instead of the general Pages list. */
function findPageWithFormMode(pages: { id: number; blocks: PageBlock[] }[], mode: string): number | null {
  for (const page of pages) {
    for (const block of page.blocks) {
      const props = block.props as Record<string, unknown>;
      if (block.type === "form" && props.mode === mode) return page.id;
      if (mode === "contact" && block.type === "contactForm") return page.id;
    }
  }
  return null;
}

export default async function ConsoleFormsPage() {
  const [forms, pages] = await Promise.all([listForms(), listPages()]);
  const contactPageId = findPageWithFormMode(pages, "contact");

  // Only these two are genuinely fixed by this app's own account/contact
  // plumbing (OTP, sessions, spam resistance) -- everything else that used
  // to be listed here as "built-in" (newsletter, the lead-magnet popup,
  // tool submission, reviews, webinar registration) has no such
  // requirement; it's just not wired onto this generic engine yet.
  const fixedForms = [
    { name: "Sign up / Log in", note: "Email, password, name, country, phone (optional). Core account fields; not yet console-editable.", editHref: null },
    { name: "Contact form", note: "Name, email and message are fixed; its heading, intro text and labels are editable.", editHref: contactPageId ? `/console/pages/${contactPageId}` : "/console/pages" },
  ];

  return (
    <div>
      <h1 className="flex items-center gap-2.5 font-display text-2xl font-semibold sm:text-3xl">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <line x1="7" y1="9" x2="17" y2="9" />
          <line x1="7" y1="13" x2="17" y2="13" />
          <line x1="7" y1="17" x2="12" y2="17" />
        </svg>
        Forms
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-ink-soft">
        Build a form with your own fields, labels and design, then place it as a page section or open it as a
        popup from any button -- reusable in as many places as you want.
      </p>
      <ConsoleForms forms={forms} fixedForms={fixedForms} />
    </div>
  );
}
