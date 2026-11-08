export type Author = {
  slug: string;
  name: string;
  role: string;
  bio: string;
  avatar: string | null;
  social: { label: string; url: string }[];
};

// Generic placeholder -- not a real person. Fresh installs have no
// blog_authors row yet (console → blog → authors creates one), so this
// is the fallback every un-configured author link/byline/sitemap entry
// resolves to until someone sets up a real one. Previously this was the
// project maintainer's own name, bio, photo, and social links, which
// every self-hosted deployment inherited unchanged.
export const authors: Record<string, Author> = {
  "site-owner": {
    slug: "site-owner",
    name: "Site Owner",
    role: "Site Owner",
    bio: "Set this up from Console -> Blog -> Authors.",
    avatar: null,
    social: [],
  },
};

export const defaultAuthorSlug = "site-owner";
