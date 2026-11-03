import ConsoleDirectory from "@/components/ConsoleDirectory";

export default async function ConsoleDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const initialTab =
    params.tab === "categories" || params.tab === "pricing"
      ? params.tab
      : "tools";
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">Tools directory</h1>
      <p className="mt-3 max-w-2xl text-sm text-ink-soft">
        Manage the categories and listings that show up on the public tools directory. External
        submissions land here as pending until you approve them.
      </p>
      <div className="mt-8">
        <ConsoleDirectory key={initialTab} initialTab={initialTab} />
      </div>
    </div>
  );
}
