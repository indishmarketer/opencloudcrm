const icons: { label: string; path: string }[] = [
  { label: "Email", path: "M4 6h16v12H4z M4 7l8 6 8-6" },
  { label: "Calendar", path: "M5 5h14v14H5z M5 9h14 M9 3v4 M15 3v4" },
  { label: "Chat", path: "M4 5h16v11H8l-4 4z" },
  { label: "Sheets", path: "M5 4h14v16H5z M5 9h14 M5 14h14 M10 4v16 M15 4v16" },
  { label: "Phone", path: "M7 3h10v18H7z M11 18h2" },
  { label: "CRM", path: "M4 20V10 M10 20V4 M16 20V13 M20 20H4" },
];

export default function IntegrationIcons() {
  return (
    <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
      {icons.map((icon) => (
        <div
          key={icon.label}
          className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-paper-soft"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="#0a0a0a" strokeWidth="1.5">
            <path d={icon.path} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[10px] font-medium uppercase tracking-wide text-ink-soft">
            {icon.label}
          </span>
        </div>
      ))}
    </div>
  );
}
