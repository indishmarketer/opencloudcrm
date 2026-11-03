import ConsoleSeoActions from "@/components/ConsoleSeoActions";

export const metadata = {
  title: "Site Actions - Console",
};

export default function SiteActionsPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">Site actions</h1>
      <p className="mt-2 text-ink-soft">
        Manage site caching, indexing, and other global tasks.
      </p>

      <div className="mt-8">
        <ConsoleSeoActions />
      </div>
    </div>
  );
}
