import ConsoleMediaLibraryTabs from "@/components/ConsoleMediaLibraryTabs";

export default function ConsoleMediaPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">Media Library</h1>
      <p className="mt-3 max-w-2xl text-sm text-ink-soft">
        Everything uploaded through this site -- blog images, avatars, directory logos, and course lesson videos.
        Nothing here is committed to the codebase; it all lives only in your own Cloudflare R2 buckets.
      </p>
      <div className="mt-8">
        <ConsoleMediaLibraryTabs />
      </div>
    </div>
  );
}
