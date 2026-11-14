import EmailSectionTabs from "@/components/EmailSectionTabs";

export default function EmailSectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">Email</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Campaigns are one-off newsletter broadcasts. Segments are live contact groups. Library holds reusable
        content plus every fixed email bound to a specific action in the app -- nothing is hardcoded, all of it is
        editable and deletable. Build event-triggered journeys in Automation. Cost is an estimate from what was
        actually sent -- Amazon SES does not report a real figure through its API.
      </p>
      <div className="mt-6"><EmailSectionTabs /></div>
      <div className="mt-8">{children}</div>
    </div>
  );
}
