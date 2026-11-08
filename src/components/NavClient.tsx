"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import GlobalSearch from "./GlobalSearch";
import MobileSearch from "./MobileSearch";
import NotificationBell from "./NotificationBell";
import type { HeaderItem } from "@/lib/siteChromeShape";

type TeaserItem = { slug: string; title: string };

const freeResourcesItems: TeaserItem[] = [{ slug: "prompt-skill-library", title: "Prompt & Skill Library" }];
const freeResourcesHref = (slug: string) => `/resources/${slug}`;

type MobileSection = string;

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MenuPanelItem({ href, label, desc }: { href: string; label: string; desc?: string }) {
  return (
    <Link
      href={href}
      className="block px-3 py-2.5 transition-colors hover:bg-paper-soft"
    >
      <p className="text-sm font-medium text-ink">{label}</p>
      {desc && <p className="mt-0.5 text-xs text-ink-soft">{desc}</p>}
    </Link>
  );
}

function ViewAllLink({ href, label, onClick, className = "" }: { href: string; label: string; onClick?: () => void; className?: string }) {
  return (
    <Link href={href} onClick={onClick} className={`group/arrow flex items-center gap-1 ${className}`}>
      {label}
      <span aria-hidden className="transition-transform group-hover/arrow:translate-x-0.5">
        &rarr;
      </span>
    </Link>
  );
}

/** One column of the 3-column Learn panel: a header link, up to 3 latest
 * items, then a "View all" link. Always shows exactly the 3 most recent
 * items passed in, whatever gets published in the future. */
function LearnColumn({ title, allHref, allLabel, items, itemHref }: { title: string; allHref: string; allLabel: string; items: TeaserItem[]; itemHref: (slug: string) => string }) {
  return (
    <div className="p-3">
      <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">{title}</p>
      <div className="divide-y divide-line">
        {items.map((item) => (
          <MenuPanelItem key={item.slug} href={itemHref(item.slug)} label={item.title} />
        ))}
      </div>
      <ViewAllLink
        href={allHref}
        label={allLabel}
        className="mt-1 rounded-xl border-t border-line px-3 py-2.5 pt-3.5 text-sm font-medium text-ink underline-offset-2 transition-colors hover:bg-paper-soft hover:underline"
      />
    </div>
  );
}

/** The site header. Menu items, their order, and the header button come
 * from Console -> Pages -> Menu & footer (passed in as `items`). */
export default function NavClient({
  courses,
  webinars,
  categories,
  items,
  ctaLabel,
  ctaHref,
  siteName,
  logoUrl,
  showCourses = true,
  showWebinars = true,
}: {
  courses: TeaserItem[];
  webinars: TeaserItem[];
  categories: TeaserItem[];
  items: HeaderItem[];
  ctaLabel: string;
  ctaHref: string;
  siteName: string;
  logoUrl: string;
  showCourses?: boolean;
  showWebinars?: boolean;
}) {
  // The "resources" mega-panel (Courses/Blog/Webinars/Free resources) only
  // ever appears in the unsaved default chrome (see DEFAULT_SITE_CHROME) --
  // once nav is customized from the console it's a plain dropdown, already
  // filtered by getPublicSiteChrome. This column count still has to react
  // to the toggles directly since Courses/Webinars here are hardcoded
  // panel columns, not chrome links.
  const resourceColumnCount = 2 + (showCourses ? 1 : 0) + (showWebinars ? 1 : 0);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<number | null>(null);
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const [openMobileSections, setOpenMobileSections] = useState<Record<string, boolean>>({});
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const mobileNavRef = useRef<HTMLElement>(null);

  function closeMobile() {
    setOpen(false);
    setOpenMobileSections({});
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled) setLoggedIn(!!body.user);
      })
      .catch(() => {
        if (!cancelled) setLoggedIn(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Lock background scroll when mobile drawer is open, and prevent touches outside from scrolling the background
  useEffect(() => {
    if (!open) return;
    const prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleTouchMove(e: TouchEvent) {
      if (mobileNavRef.current && mobileNavRef.current.contains(e.target as Node)) {
        return;
      }
      if (e.cancelable) {
        e.preventDefault();
      }
    }

    document.addEventListener("touchmove", handleTouchMove, { passive: false });

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.removeEventListener("touchmove", handleTouchMove);
    };
  }, [open]);

  // Close mobile drawer on desktop resize
  useEffect(() => {
    function handleResize() {
      if (window.innerWidth >= 768) {
        closeMobile();
      }
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent | TouchEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setMenu(null);
        setAuthMenuOpen(false);
        closeMobile();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenu(null);
        setAuthMenuOpen(false);
        closeMobile();
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick, { passive: true });
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  function toggle(index: number) {
    setMenu((v) => (v === index ? null : index));
  }

  function toggleMobile(name: MobileSection) {
    setOpenMobileSections((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
  }

  function isMobileSectionOpen(name: MobileSection) {
    return Boolean(openMobileSections[name]);
  }

  return (
    <header ref={navRef} className="sticky top-0 z-50 border-b border-line bg-paper/90 backdrop-blur">
      <div className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-display text-lg font-semibold tracking-tight">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo is an arbitrary uploaded URL, no fixed dimensions
            <img src={logoUrl} alt={siteName} className="h-9 w-auto" />
          ) : (
            siteName
          )}
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {items.map((item, i) =>
            item.type === "link" ? (
              <Link
                key={i}
                href={item.href}
                className="rounded-full px-3 py-2 text-sm font-semibold text-ink-soft transition-colors hover:text-ink"
              >
                {item.label}
              </Link>
            ) : (
              <div key={i} className="relative">
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  aria-expanded={menu === i}
                  className="flex items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold text-ink-soft transition-colors hover:text-ink"
                >
                  {item.label} <ChevronIcon open={menu === i} />
                </button>
                {item.type === "dropdown" && menu === i && (
                  <div
                    className={`absolute top-full mt-2 grid min-w-64 max-w-[calc(100vw-2rem)] grid-flow-col auto-cols-[minmax(13rem,1fr)] divide-x divide-line rounded-2xl border border-line bg-paper p-2 shadow-lg ${
                      i >= items.length - 1 ? "right-0" : "left-0"
                    }`}
                  >
                    {item.columns.map((column, columnIndex) => <div key={`${column.title}-${columnIndex}`} className="min-w-0 px-2">
                      {column.title && <h3 className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">{column.title}</h3>}
                      {column.links.map((l) => <MenuPanelItem key={`${l.href}-${l.label}`} href={l.href} label={l.label} desc={l.description} />)}
                    </div>)}
                  </div>
                )}
              </div>
            )
          )}
        </nav>

        {/* The Resources panel is wide enough (960px, near the full header
         * width) to overflow the viewport when anchored to its own
         * (off-center) trigger button, so it anchors to the centered header
         * row instead. Dropdowns are narrow and stay under their button. */}
        {menu !== null && items[menu]?.type === "resources" && (
          <div
            className="absolute left-1/2 top-full mt-2 max-w-[calc(100vw-2rem)] -translate-x-1/2 divide-x divide-line rounded-2xl border border-line bg-paper shadow-lg"
            style={{ display: "grid", width: `${resourceColumnCount * 240}px`, gridTemplateColumns: `repeat(${resourceColumnCount}, minmax(0, 1fr))` }}
          >
            {showCourses && <LearnColumn title="Courses" allHref="/courses" allLabel="View all courses" items={courses} itemHref={(slug) => `/courses/${slug}`} />}
            <LearnColumn title="Blog" allHref="/blog" allLabel="View all posts" items={categories} itemHref={(slug) => `/blog/category/${slug}`} />
            {showWebinars && <LearnColumn title="Webinars" allHref="/webinars" allLabel="View all webinars" items={webinars} itemHref={(slug) => `/webinars/${slug}`} />}
            <LearnColumn title="Free Resources" allHref="/resources" allLabel="View all resources" items={freeResourcesItems} itemHref={freeResourcesHref} />
          </div>
        )}

        <div className="flex items-center gap-2">
          <GlobalSearch />
          {loggedIn && <NotificationBell />}
          {loggedIn === true && (
            <Link
              href="/account"
              className="hidden items-center gap-2 rounded-full border border-line px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-ink/50 hover:bg-paper-soft md:flex"
            >
              <UserIcon />
              Account
            </Link>
          )}
          {loggedIn === false && (
            <div className="relative hidden md:block">
              <button
                type="button"
                onClick={() => setAuthMenuOpen((value) => !value)}
                aria-expanded={authMenuOpen}
                className="flex items-center gap-2 rounded-full border border-line px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-ink/50 hover:bg-paper-soft"
              >
                <UserIcon />
                Log in
                <ChevronIcon open={authMenuOpen} />
              </button>
              {authMenuOpen && (
                <div className="absolute right-0 top-full z-20 mt-2 w-44 rounded-xl border border-line bg-paper p-1.5 shadow-lg">
                  <Link href="/login" className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink hover:bg-paper-soft">Log in</Link>
                  {/* Same hairline the rest of the nav uses between items,
                      inset so it reads as a separator rather than a border. */}
                  <div className="mx-3 my-0.5 border-t border-line" />
                  <Link href="/signup" className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink hover:bg-paper-soft">Sign up</Link>
                </div>
              )}
            </div>
          )}
          {ctaLabel && ctaHref && (
            <Link
              href={ctaHref}
              className={`rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80${loggedIn ? " hidden md:inline-block" : ""}`}
            >
              {ctaLabel}
            </Link>
          )}
          <button
            type="button"
            onClick={() => (open ? closeMobile() : setOpen(true))}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line md:hidden"
          >
            <span className="relative block h-3 w-4">
              <span
                className={`absolute left-0 top-0 h-[1.5px] w-4 bg-ink transition-transform ${open ? "translate-y-[5px] rotate-45" : ""}`}
              />
              <span
                className={`absolute left-0 top-[5px] h-[1.5px] w-4 bg-ink transition-opacity ${open ? "opacity-0" : ""}`}
              />
              <span
                className={`absolute left-0 top-[10px] h-[1.5px] w-4 bg-ink transition-transform ${open ? "-translate-y-[5px] -rotate-45" : ""}`}
              />
            </span>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <nav
          ref={mobileNavRef}
          aria-label="Mobile navigation"
          className="max-h-[calc(100vh-4.25rem)] max-h-[calc(100dvh-4.25rem)] overflow-y-auto overscroll-contain border-t border-line bg-paper px-6 pt-4 pb-12 md:hidden [-webkit-overflow-scrolling:touch]"
        >
          <MobileSearch onNavigate={closeMobile} />
          <ul className="flex flex-col gap-1">
            {items.map((item, i) => {
              if (item.type === "link") {
                return (
                  <li key={i} className={i > 0 ? "mt-1 border-t border-line pt-1" : ""}>
                    <Link
                      href={item.href}
                      onClick={closeMobile}
                      className="block rounded-lg px-1 py-2.5 text-sm font-medium text-ink"
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              }
              if (item.type === "dropdown") {
                const key = `menu-${i}`;
                const isOpen = isMobileSectionOpen(key);
                return (
                  <li key={i} className={i > 0 ? "mt-1 border-t border-line pt-1" : ""}>
                    <button
                      type="button"
                      onClick={() => toggleMobile(key)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center justify-between rounded-lg px-1 py-2.5 text-sm font-medium text-ink"
                    >
                      {item.label}
                      <ChevronIcon open={isOpen} />
                    </button>
                    {isOpen && (
                      <div className="divide-y divide-line pb-1 pl-1">
                        {item.columns.map((column, columnIndex) => (
                          <div key={`${column.title}-${columnIndex}`} className="py-1">
                            {column.title && (
                              <p className="px-1 py-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                                {column.title}
                              </p>
                            )}
                            {column.links.map((l) => (
                              <Link
                                key={`${l.href}-${l.label}`}
                                href={l.href}
                                onClick={closeMobile}
                                className="block px-1 py-2 text-sm text-ink transition-colors hover:text-ink-soft"
                              >
                                {l.label}
                              </Link>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                );
              }
              return (
                <li key={i} className={i > 0 ? "mt-1 border-t border-line pt-1" : ""}>
                  <p className="px-1 py-2.5 text-sm font-medium text-ink">{item.label}</p>
                  <div className="pl-1">
                    {showCourses && (
                    <>
                    <button
                      type="button"
                      onClick={() => toggleMobile("learn-courses")}
                      aria-expanded={isMobileSectionOpen("learn-courses")}
                      className="flex w-full items-center justify-between rounded-lg px-1 py-2 text-sm text-ink-soft"
                    >
                      Courses
                      <ChevronIcon open={isMobileSectionOpen("learn-courses")} />
                    </button>
                    {isMobileSectionOpen("learn-courses") && (
                      <div className="pb-1 pl-2">
                        <div className="divide-y divide-line">
                          {courses.map((c) => (
                            <Link
                              key={c.slug}
                              href={`/courses/${c.slug}`}
                              onClick={closeMobile}
                              className="block px-1 py-2 text-sm text-ink-soft transition-colors hover:text-ink"
                            >
                              {c.title}
                            </Link>
                          ))}
                        </div>
                        <ViewAllLink
                          href="/courses"
                          label="View all courses"
                          onClick={closeMobile}
                          className="border-t border-line px-1 py-2 pt-3 text-sm font-medium text-ink"
                        />
                      </div>
                    )}
                    </>
                    )}

                    <button
                      type="button"
                      onClick={() => toggleMobile("learn-blog")}
                      aria-expanded={isMobileSectionOpen("learn-blog")}
                      className="flex w-full items-center justify-between rounded-lg px-1 py-2 text-sm text-ink-soft"
                    >
                      Blog
                      <ChevronIcon open={isMobileSectionOpen("learn-blog")} />
                    </button>
                    {isMobileSectionOpen("learn-blog") && (
                      <div className="pb-1 pl-2">
                        <div className="divide-y divide-line">
                          {categories.map((c) => (
                            <Link
                              key={c.slug}
                              href={`/blog/category/${c.slug}`}
                              onClick={closeMobile}
                              className="block px-1 py-2 text-sm text-ink-soft transition-colors hover:text-ink"
                            >
                              {c.title}
                            </Link>
                          ))}
                        </div>
                        <ViewAllLink
                          href="/blog"
                          label="View all posts"
                          onClick={closeMobile}
                          className="border-t border-line px-1 py-2 pt-3 text-sm font-medium text-ink"
                        />
                      </div>
                    )}

                    {showWebinars && (
                    <>
                    <button
                      type="button"
                      onClick={() => toggleMobile("learn-webinars")}
                      aria-expanded={isMobileSectionOpen("learn-webinars")}
                      className="flex w-full items-center justify-between rounded-lg px-1 py-2 text-sm text-ink-soft"
                    >
                      Webinars
                      <ChevronIcon open={isMobileSectionOpen("learn-webinars")} />
                    </button>
                    {isMobileSectionOpen("learn-webinars") && (
                      <div className="pb-1 pl-2">
                        <div className="divide-y divide-line">
                          {webinars.map((w) => (
                            <Link
                              key={w.slug}
                              href={`/webinars/${w.slug}`}
                              onClick={closeMobile}
                              className="block px-1 py-2 text-sm text-ink-soft transition-colors hover:text-ink"
                            >
                              {w.title}
                            </Link>
                          ))}
                        </div>
                        <ViewAllLink
                          href="/webinars"
                          label="View all webinars"
                          onClick={closeMobile}
                          className="border-t border-line px-1 py-2 pt-3 text-sm font-medium text-ink"
                        />
                      </div>
                    )}
                    </>
                    )}

                    <button
                      type="button"
                      onClick={() => toggleMobile("learn-resources")}
                      aria-expanded={isMobileSectionOpen("learn-resources")}
                      className="flex w-full items-center justify-between rounded-lg px-1 py-2 text-sm text-ink-soft"
                    >
                      Free Resources
                      <ChevronIcon open={isMobileSectionOpen("learn-resources")} />
                    </button>
                    {isMobileSectionOpen("learn-resources") && (
                      <div className="pb-1 pl-2">
                        <div className="divide-y divide-line">
                          {freeResourcesItems.map((item) => (
                            <Link
                              key={item.slug}
                              href={freeResourcesHref(item.slug)}
                              onClick={closeMobile}
                              className="block px-1 py-2 text-sm text-ink-soft transition-colors hover:text-ink"
                            >
                              {item.title}
                            </Link>
                          ))}
                        </div>
                        <ViewAllLink
                          href="/resources"
                          label="View all resources"
                          onClick={closeMobile}
                          className="border-t border-line px-1 py-2 pt-3 text-sm font-medium text-ink"
                        />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}

            <li className="mt-2 border-t border-line pt-2">
              {loggedIn === true && (
                <Link
                  href="/account"
                  onClick={closeMobile}
                  className="mt-2 flex w-fit items-center gap-2 rounded-full border border-line px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-ink/50 hover:bg-paper-soft"
                >
                  <UserIcon /> Account
                </Link>
              )}
              {loggedIn === false && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setAuthMenuOpen((value) => !value)}
                    aria-expanded={authMenuOpen}
                    className="flex w-full items-center justify-between rounded-lg px-1 py-2 text-sm font-medium text-ink"
                  >
                    Log in or sign up <ChevronIcon open={authMenuOpen} />
                  </button>
                  {authMenuOpen && (
                    <div className="ml-1 border-l border-line pl-3">
                      <Link href="/login" onClick={() => { closeMobile(); setAuthMenuOpen(false); }} className="block py-2 text-sm text-ink-soft hover:text-ink">Log in</Link>
                      <Link href="/signup" onClick={() => { closeMobile(); setAuthMenuOpen(false); }} className="block py-2 text-sm text-ink-soft hover:text-ink">Sign up</Link>
                    </div>
                  )}
                </div>
              )}
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
