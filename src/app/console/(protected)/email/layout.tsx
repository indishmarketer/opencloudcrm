import EmailSectionTabs from "@/components/EmailSectionTabs";

export default function EmailSectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">Email</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Campaigns are one-off newsletter broadcasts. Segments are live contact groups. Transactional emails are
        confirmations and access messages sent by one specific action. Build cross-channel journeys in Automation.
        Cost is an estimate from what was actually sent -- Amazon SES does not report a real figure through its API.
      </p>
      <div className="mt-6"><EmailSectionTabs /></div>
      <div className="mt-8">{children}</div>
    </div>
  );
}
