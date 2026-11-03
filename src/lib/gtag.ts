declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackEvent(name: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  if (window.location.pathname.startsWith("/console")) return;
  window.gtag("event", name, {
    source_page: window.location.pathname,
    page_location: `${window.location.origin}${window.location.pathname}`,
    page_referrer: document.referrer || undefined,
    ...params,
  });
}
