/** One small monochrome icon per console nav entry, keyed by href so both
 * the sidebar and the mobile nav stay in step without passing icons around
 * in the nav data. Stroke-only and currentColor, so each one picks up the
 * link's own hover and active colour. */

const PATHS: Record<string, React.ReactNode> = {
  "/console": <path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5" />,
  "/console/analytics": <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  "/console/attention": (
    <>
      <path d="M12 4 2.5 20h19L12 4Z" />
      <path d="M12 10v4M12 17.5v.5" />
    </>
  ),
  "/console/contacts": (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M17 11a3 3 0 0 0 0-6M18 20c0-2.2-.8-4-2-5" />
    </>
  ),
  "/console/support": (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="m14.5 9.5 3-3M6.5 17.5l3-3M14.5 14.5l3 3M6.5 6.5l3 3" />
    </>
  ),
  "/console/community": (
    <>
      <circle cx="8" cy="9" r="3" />
      <circle cx="16.5" cy="10" r="2.5" />
      <path d="M2.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5M15 14c3 0 6 1.5 6 5" />
    </>
  ),
  "/console/email": (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  "/console/workflows": (
    <>
      <circle cx="5" cy="12" r="2.5" />
      <circle cx="19" cy="6" r="2.5" />
      <circle cx="19" cy="18" r="2.5" />
      <path d="M7.5 11 16.5 7M7.5 13 16.5 17" />
    </>
  ),
  "/console/whatsapp": (
    <>
      <path d="M4.2 19.8 5.5 16A8.5 8.5 0 1 1 8.3 19l-4.1.8Z" />
      <path d="M9 8.1c.2-.4.4-.4.7-.4h.4c.2 0 .4.1.5.4l.7 1.6c.1.3.1.5-.1.7l-.5.6c-.2.2-.2.4 0 .7.5.8 1.2 1.5 2 1.9.3.2.5.2.7-.1l.6-.7c.2-.2.4-.3.7-.2l1.6.8c.3.1.4.3.4.5 0 .4-.2 1.2-.7 1.6-.5.5-1.3.7-2 .6-1.2-.2-2.8-1-4.1-2.3-1.1-1.1-2-2.7-2.1-3.8-.1-.8.2-1.5.6-1.9Z" />
    </>
  ),
  "/console/pages": (
    <>
      <rect x="3" y="3.5" width="18" height="17" rx="2" />
      <path d="M3 8.5h18M8 8.5v12M11 12.5h6.5M11 16h4.5" />
    </>
  ),
  "/console/blog": (
    <>
      <path d="M5 3.5h9l5 5V20a.5.5 0 0 1-.5.5h-13A.5.5 0 0 1 5 20V4a.5.5 0 0 1 .5-.5Z" />
      <path d="M14 3.5V9h5M8.5 13h7M8.5 16.5h5" />
    </>
  ),
  "/console/media": (
    <>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2" />
      <circle cx="8.5" cy="10" r="1.75" />
      <path d="m4 17 5-5 4.5 4.5 2-2 4.5 4.5" />
    </>
  ),
  "/console/courses": (
    <>
      <path d="M3 5.5h7a2.5 2.5 0 0 1 2 2.4V20a2 2 0 0 0-2-1.6H3Z" />
      <path d="M21 5.5h-7a2.5 2.5 0 0 0-2 2.4V20a2 2 0 0 1 2-1.6h7Z" />
    </>
  ),
  "/console/directory": (
    <>
      <rect x="3" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13" width="7.5" height="7.5" rx="1.5" />
    </>
  ),
  "/console/lead-magnets": (
    <>
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
      <path d="M12 2v8l2.5-2 2.5 2V2" />
    </>
  ),
  "/console/prompt-library": (
    <>
      <path d="M4 4.5h5.5A2.5 2.5 0 0 1 12 7v13a2 2 0 0 0-2-1.5H4Z" />
      <path d="M20 4.5h-5.5A2.5 2.5 0 0 0 12 7" />
      <path d="M20 4.5V18.5h-6" />
    </>
  ),
  "/console/sales": (
    <>
      <path d="M3.5 19.5V13M9 19.5V8M14.5 19.5v-5M20 19.5V4.5" />
    </>
  ),
  "/console/meetings": (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9.5h18M8 3v4M16 3v4" />
    </>
  ),
  "/console/webinars": (
    <>
      <rect x="2.5" y="6" width="13" height="12" rx="2" />
      <path d="m15.5 11 6-3.5v9l-6-3.5Z" />
    </>
  ),
  "/console/reviews": <path d="m12 3.5 2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.8l6-.8Z" />,
  "/console/integrations": (
    <>
      <path d="M9 3.5v4M15 3.5v4" />
      <rect x="5.5" y="7.5" width="13" height="6" rx="2" />
      <path d="M12 13.5v3a4 4 0 0 0 4 4" />
    </>
  ),
  "/console/site-actions": <path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12l1-7.5Z" />,
  "/console/payments": (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
      <path d="M2.5 10h19M6 14.5h4" />
    </>
  ),
  "/console/site-settings": (
    <>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="8" cy="17" r="2.2" />
    </>
  ),
  "/console/security": (
    <>
      <path d="M12 3 5 6v6c0 4.2 2.9 7.7 7 9 4.1-1.3 7-4.8 7-9V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  "/console/api-tokens": (
    <>
      <circle cx="7.5" cy="16.5" r="3.5" />
      <path d="M10 14 19 5M15.5 6 18 8.5M18 3.5 20.5 6" />
    </>
  ),
  "/console/team": (
    <>
      <circle cx="10" cy="8" r="3.5" />
      <path d="M3.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M18.5 7v5M21 9.5h-5" />
    </>
  ),
};

export default function ConsoleNavIcon({ href }: { href: string }) {
  const icon = PATHS[href];
  if (!icon) return <span aria-hidden="true" className="h-4 w-4 shrink-0" />;
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {icon}
    </svg>
  );
}
