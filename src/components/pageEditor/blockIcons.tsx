/** One small line icon per section type, for the compact Elements palette
 * (icon + short label, not a paragraph of description text). Similar
 * sections share an icon where a distinct one isn't worth the extra
 * clutter (e.g. every "live content" block uses the same feed icon). */
const PATHS: Record<string, string> = {
  hero: "M3 5h18v5H3z M3 13h11 M3 17h7",
  pageHeader: "M4 7h16 M4 12h10 M4 17h6",
  richText: "M4 6h16 M4 11h16 M4 16h10",
  heading: "M5 5v14 M19 5v14 M5 12h14",
  button: "M4 9h16a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2Z M8 12h8",
  icon: "M12 2.5l2.2 4.6 5 .7-3.6 3.5.8 5-4.4-2.4-4.4 2.4.8-5-3.6-3.5 5-.7Z",
  row: "M3 4h6v16H3z M10 4h4v16h-4z M15 4h6v16h-6z",
  cards: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z",
  split: "M3 4h8v16H3z M13 4h8v16h-8z",
  image: "M3 4h18v16H3z M3 16l5-5 4 4 3-3 6 6 M8.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z",
  video: "M3 5h18v14H3z M10 9l6 3-6 3Z",
  cta: "M4 5h16v6H4z M4 15h10v4H4z",
  faq: "M4 4h16v11H9l-4 4V15H4z M11 9.2c0-1 .8-1.7 1.8-1.7s1.8.6 1.8 1.5c0 1.3-1.8 1.3-1.8 2.7 M12.8 13.8h.01",
  stats: "M4 20V11 M10 20V4 M16 20V14 M20 20H4",
  live: "M4 5h16v3H4z M4 11h10v3H4z M4 17h7v3H4z",
  workflowDemo: "M4 6h6v4H4z M14 6h6v4h-6z M9 8h5 M9 14h6v4H9z M12 10v4",
  integrations: "M8 3h8l1 4-4 1-4-1Z M4 10h16v10H4z",
  featuredOn: "M12 3l2.3 4.8 5.2.7-3.8 3.7.9 5.3-4.6-2.4-4.6 2.4.9-5.3-3.8-3.7 5.2-.7Z",
  form: "M4 4h16v16H4z M7 8h10 M7 12h10 M7 16h6",
  contactDetails: "M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M5 20c1.5-4.5 5-6.5 7-6.5s5.5 2 7 6.5",
  businessDetails: "M4 9h16v10H4z M9 9V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3",
  spacer: "M4 8l3-3 3 3 M4 16l3 3 3-3 M7 5v14 M14 5h6v14h-6z",
  custom: "M9 7l-5 5 5 5 M15 7l5 5-5 5",
  customCode: "M8 8l-4 4 4 4 M16 8l4 4-4 4 M13 5l-2 14",
  countdown: "M12 12V7 M12 12l3.5 2 M12 3h0 M9 3h6 M5.6 6.6 4.2 5.2 M18.4 6.6l1.4-1.4 M4 14a8 8 0 1 0 16 0 8 8 0 0 0-16 0Z",
  socialIcons: "M6 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z M18 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z M18 21.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z M8.2 10.8l7.6-3.6 M8.2 13.2l7.6 3.6",
  divider: "M4 12h4 M10 12h4 M16 12h4",
  list: "M4 6h.01 M8 6h12 M4 12h.01 M8 12h12 M4 18h.01 M8 18h12",
  testimonial: "M4 8a3 3 0 0 1 3-3v2a1 1 0 0 0-1 1v1h2v5H4V8Z M13 8a3 3 0 0 1 3-3v2a1 1 0 0 0-1 1v1h2v5h-4V8Z",
  rating: "M12 3.5l1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6Z",
  alert: "M12 3 2 20h20Z M12 10v4 M12 17h.01",
  blockquote: "M6 7h5v5H7c0 2-1 3-3 3v2c3 0 5-2 5-5V7Z M14 7h5v5h-4c0 2-1 3-3 3v2c3 0 5-2 5-5V7Z",
  table: "M3 5h18v14H3z M3 10h18 M9 5v14",
  progress: "M4 8h16 M4 8v2H9v-2 M4 15h16 M4 15v2h13v-2",
  priceTable: "M6 3h12v18l-6-3-6 3Z M9 11h6 M9 14h4",
  teamMember: "M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M5 20c1.5-4.5 5-6.5 7-6.5s5.5 2 7 6.5",
  steps: "M4 6h2v2H4z M9 7h11 M4 14h2v2H4z M9 15h11",
  tabs: "M3 6h6v3H3z M11 6h10v3H11z M3 9v9h18V9",
  map: "M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2Z M9 4v14 M15 6v14",
  embed: "M8 7 3 12l5 5 M16 7l5 5-5 5 M13 4l-2 16",
  breadcrumbs: "M3 12h3l2-4 2 8 2-8 2 4h7",
  audio: "M4 10v4 M8 7v10 M12 4v16 M16 7v10 M20 10v4",
  logo: "M5 4h14v12l-7 4-7-4Z M9 9h6v4H9z",
};

const DEFAULT_PATH = "M5 5h14v14H5z";

export default function BlockIcon({ type, className = "h-5 w-5" }: { type: string; className?: string }) {
  const d = PATHS[type] ?? DEFAULT_PATH;
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/** latestPosts/latestCourses/reviews share "live", form sub-types share "form", builtIn shares "pageHeader". */
export function iconKeyFor(type: string): string {
  if (type === "latestPosts" || type === "latestCourses" || type === "reviews") return "live";
  if (type === "contactForm" || type === "newsletter") return "form";
  if (type === "builtIn") return "pageHeader";
  return type;
}
