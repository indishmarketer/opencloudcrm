"use client";

import { useEffect, useState } from "react";

type Analytics = {
  ga4: {
    sessions?: string;
    activeUsers?: string;
    avgSessionSeconds?: string;
    pageViews?: string;
    keyEvents?: string;
    topPages?: { path: string; views: string }[];
    topLandingPages?: { path: string; sessions: string }[];
    error?: string;
    fetchedAt?: string;
  };
  searchConsole: {
    clicks?: number;
    impressions?: number;
    ctr?: number;
    position?: number;
    topQueries?: { query: string; clicks: number; impressions: number }[];
    topPages?: { page: string; clicks: number; impressions: number }[];
    error?: string;
    fetchedAt?: string;
  };
  bing: {
    clicks?: number;
    impressions?: number;
    topQueries?: { query: string; clicks: number; impressions: number }[];
    topPages?: { page: string; clicks: number; impressions: number }[];
    error?: string;
    fetchedAt?: string;
  };
  fetchedAt?: string;
};

const TABS = [
  { key: "ga4", label: "Google Analytics" },
  { key: "searchConsole", label: "Search Console" },
  { key: "bing", label: "Bing Webmaster" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function downloadJson(payload: unknown, filenamePart: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `indish-marketer-${filenamePart}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("ga4");

  useEffect(() => {
    // Shows whatever was last refreshed -- this is a plain DB read, not a
    // call to any external API, so it's safe to run on every page view.
    fetch("/api/console/analytics")
      .then((res) => res.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/console/analytics", { method: "POST" });
      const body = await res.json();
      setData(body);
    } finally {
      setLoading(false);
    }
  }

  const lastRefreshed = data
    ? [
        data.ga4.fetchedAt,
        data.searchConsole.fetchedAt,
        data.bing.fetchedAt,
      ]
        .filter((d): d is string => !!d)
        .sort()
        .pop()
    : undefined;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Analytics & Metrics</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Shows the last dump on file. These platforms have real rate/quota limits, so nothing
            here ever calls their APIs automatically, only when you click Refresh.
            {lastRefreshed && <> Last refreshed {new Date(lastRefreshed).toLocaleString()}.</>}
          </p>
        </div>
        <div className="flex gap-3">
          {data && (
            <button
              onClick={() => downloadJson(data, "analytics-all")}
              className="rounded-full border border-line px-5 py-2 text-sm font-medium transition-colors hover:border-ink"
            >
              Download all reports
            </button>
          )}
          <button
            onClick={refresh}
            disabled={loading}
            className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {loading ? "Working…" : "Refresh"}
          </button>
        </div>
      </div>

      {!data && loading && <p className="mt-10 text-sm text-ink-soft">Loading last dump…</p>}

      {data && (
        <div className="mt-8">
          <div className="flex flex-wrap gap-2 border-b border-line pb-4">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  tab === t.key ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-soft hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "ga4" && (
            <Section title="Google Analytics (last 28 days)" onDownload={() => downloadJson(data.ga4, "google-analytics")}>
              {data.ga4.error ? (
                <p className="mt-3 text-sm text-red-600">{data.ga4.error}</p>
              ) : (
                <>
                  <div className="mt-4 grid gap-4 sm:grid-cols-5">
                    <Stat label="Sessions" value={data.ga4.sessions} />
                    <Stat label="Active users" value={data.ga4.activeUsers} />
                    <Stat
                      label="Avg. session"
                      value={
                        data.ga4.avgSessionSeconds
                          ? `${Math.round(Number(data.ga4.avgSessionSeconds))}s`
                          : "0s"
                      }
                    />
                    <Stat label="Page views" value={data.ga4.pageViews} />
                    <Stat label="Key events" value={data.ga4.keyEvents} />
                  </div>
                  <div className="mt-4 grid gap-6 lg:grid-cols-2">
                    {!!data.ga4.topLandingPages?.length && (
                      <SimpleTable
                        title="Top pages by sessions"
                        columns={["Page", "Sessions"]}
                        rows={data.ga4.topLandingPages.map((p) => [p.path, p.sessions])}
                      />
                    )}
                    {!!data.ga4.topPages?.length && (
                      <SimpleTable
                        title="Top pages by views"
                        columns={["Page", "Views"]}
                        rows={data.ga4.topPages.map((p) => [p.path, p.views])}
                      />
                    )}
                  </div>
                </>
              )}
            </Section>
          )}

          {tab === "searchConsole" && (
            <Section title="Google Search Console (last 28 days)" onDownload={() => downloadJson(data.searchConsole, "search-console")}>
              {data.searchConsole.error ? (
                <p className="mt-3 text-sm text-red-600">{data.searchConsole.error}</p>
              ) : (
                <>
                  <div className="mt-4 grid gap-4 sm:grid-cols-4">
                    <Stat label="Clicks" value={data.searchConsole.clicks} />
                    <Stat label="Impressions" value={data.searchConsole.impressions} />
                    <Stat
                      label="Avg. CTR"
                      value={
                        data.searchConsole.ctr !== undefined
                          ? `${(data.searchConsole.ctr * 100).toFixed(1)}%`
                          : "0%"
                      }
                    />
                    <Stat label="Avg. position" value={data.searchConsole.position?.toFixed(1)} />
                  </div>
                  <div className="mt-4 grid gap-6 lg:grid-cols-2">
                    {!!data.searchConsole.topQueries?.length && (
                      <SimpleTable
                        title="Top queries"
                        columns={["Query", "Clicks", "Impressions"]}
                        rows={data.searchConsole.topQueries.map((q) => [q.query, q.clicks, q.impressions])}
                      />
                    )}
                    {!!data.searchConsole.topPages?.length && (
                      <SimpleTable
                        title="Top pages"
                        columns={["Page", "Clicks", "Impressions"]}
                        rows={data.searchConsole.topPages.map((p) => [p.page, p.clicks, p.impressions])}
                      />
                    )}
                  </div>
                </>
              )}
            </Section>
          )}

          {tab === "bing" && (
            <Section title="Bing Webmaster (last 28 days)" onDownload={() => downloadJson(data.bing, "bing-webmaster")}>
              {data.bing.error ? (
                <p className="mt-3 text-sm text-red-600">{data.bing.error}</p>
              ) : (
                <>
                  <div className="mt-4 grid gap-4 sm:grid-cols-4">
                    <Stat label="Clicks" value={data.bing.clicks} />
                    <Stat label="Impressions" value={data.bing.impressions} />
                  </div>
                  <div className="mt-4 grid gap-6 lg:grid-cols-2">
                    {!!data.bing.topQueries?.length && (
                      <SimpleTable
                        title="Top queries"
                        columns={["Query", "Clicks", "Impressions"]}
                        rows={data.bing.topQueries.map((q) => [q.query, q.clicks, q.impressions])}
                      />
                    )}
                    {!!data.bing.topPages?.length && (
                      <SimpleTable
                        title="Top pages"
                        columns={["Page", "Clicks", "Impressions"]}
                        rows={data.bing.topPages.map((p) => [p.page, p.clicks, p.impressions])}
                      />
                    )}
                  </div>
                </>
              )}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, onDownload, children }: { title: string; onDownload: () => void; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onDownload}
          className="rounded-full border border-line px-4 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-ink hover:text-ink"
        >
          Download this report
        </button>
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <p className="text-2xl font-semibold">{value ?? "0"}</p>
      <p className="mt-1 text-xs text-ink-soft">{label}</p>
    </div>
  );
}

function SimpleTable({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="mt-2 overflow-x-auto rounded-2xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-ink-soft">
            <tr>
              {columns.map((c) => (
                <th key={c} className="px-4 py-2 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-2 break-all">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
