"use client";

import { useEffect, useState } from "react";

type SaveState = "idle" | "loading" | "saving" | "saved" | "error";

export default function ConsoleCrawlSettings() {
  const [state, setState] = useState<SaveState>("loading");
  const [error, setError] = useState("");
  const [robotsExtraDisallow, setRobotsExtraDisallow] = useState("");
  const [robotsExtraAllow, setRobotsExtraAllow] = useState("");
  const [sitemapExtraUrls, setSitemapExtraUrls] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/console/crawl-settings");
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Could not load.");
        setRobotsExtraDisallow(body.settings.robotsExtraDisallow.join("\n"));
        setRobotsExtraAllow(body.settings.robotsExtraAllow.join("\n"));
        setSitemapExtraUrls(body.settings.sitemapExtraUrls.join("\n"));
        setState("idle");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load.");
        setState("error");
      }
    })();
  }, []);

  async function save() {
    setState("saving");
    setError("");
    try {
      const res = await fetch("/api/console/crawl-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          robotsExtraDisallow: robotsExtraDisallow.split("\n"),
          robotsExtraAllow: robotsExtraAllow.split("\n"),
          sitemapExtraUrls: sitemapExtraUrls.split("\n"),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Save failed.");
      // The server strips anything that touches a protected path -- show
      // back exactly what was kept, in case a line was dropped.
      setRobotsExtraDisallow(body.settings.robotsExtraDisallow.join("\n"));
      setRobotsExtraAllow(body.settings.robotsExtraAllow.join("\n"));
      setSitemapExtraUrls(body.settings.sitemapExtraUrls.join("\n"));
      setState("saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
      setState("error");
    }
  }

  if (state === "loading") {
    return <p className="mt-4 text-sm text-ink-soft">Loading...</p>;
  }

  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <div className="rounded-2xl border border-line bg-paper p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">robots.txt</h2>
          <a href="/robots.txt" target="_blank" rel="noreferrer" className="text-sm text-ink underline">
            View live file
          </a>
        </div>
        <p className="mt-2 text-sm text-ink-soft">
          Add your own rules on top of the built-in ones. Paths that always stay blocked
          (console, account, password reset, the API) can&apos;t be changed here.
        </p>
        <label className="mt-4 block text-sm font-medium">Additional disallowed paths (one per line)</label>
        <textarea
          value={robotsExtraDisallow}
          onChange={(e) => setRobotsExtraDisallow(e.target.value)}
          placeholder={"/drafts\n/internal-notes"}
          rows={4}
          className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm font-mono"
        />
        <label className="mt-3 block text-sm font-medium">Additional allowed paths (one per line)</label>
        <textarea
          value={robotsExtraAllow}
          onChange={(e) => setRobotsExtraAllow(e.target.value)}
          placeholder={"/drafts/preview"}
          rows={3}
          className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm font-mono"
        />
      </div>

      <div className="rounded-2xl border border-line bg-paper p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">sitemap.xml</h2>
          <a href="/sitemap.xml" target="_blank" rel="noreferrer" className="text-sm text-ink underline">
            View live file
          </a>
        </div>
        <p className="mt-2 text-sm text-ink-soft">
          Pages, courses, posts and the directory are already in the sitemap automatically. Add
          extra paths here only for pages outside those. To remove something that&apos;s already
          in there, mark that page &quot;noindex&quot; instead -- this list can&apos;t override that.
        </p>
        <label className="mt-4 block text-sm font-medium">Additional sitemap paths (one per line)</label>
        <textarea
          value={sitemapExtraUrls}
          onChange={(e) => setSitemapExtraUrls(e.target.value)}
          placeholder={"/some-standalone-page"}
          rows={4}
          className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm font-mono"
        />
      </div>

      <div className="sm:col-span-2">
        <button
          onClick={save}
          disabled={state === "saving"}
          className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {state === "saving" ? "Saving..." : "Save"}
        </button>
        {state === "saved" && <span className="ml-3 text-sm text-ink-soft">Saved.</span>}
        {state === "error" && <span className="ml-3 text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
