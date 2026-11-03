import ConsolePromptLibrary from "@/components/ConsolePromptLibrary";

export default function ConsolePromptLibraryPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">Prompt &amp; Skill Library</h1>
      <p className="mt-3 max-w-2xl text-sm text-ink-soft">
        Manage the categories, prompts, and skills shown in the free, public Prompt &amp; Skill
        Library. Only published items appear on the site.
      </p>
      <div className="mt-8">
        <ConsolePromptLibrary />
      </div>
    </div>
  );
}
