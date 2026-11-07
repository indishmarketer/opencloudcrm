# OpenCloudCRM

OpenCloudCRM is a self-hostable Next.js business site + CRM: a blog, a tools
directory, courses, community, payments, email/WhatsApp marketing, and an
admin console, all in one app.

It's also the codebase behind [indishmarketer.com](https://www.indishmarketer.com),
one real production deployment. That site's own content (its pages, menu,
business details) lives in its database, not in this repo, so a fresh
install starts with neutral placeholder pages that you replace with your own.

## What you actually get

A fresh install comes up with a small set of neutral starter pages (Home,
About, Services, Products, Resources, Contact), the built-in app sections
(blog, courses, tools directory, webinars, community, reviews, legal pages)
and an admin console at `/console`.

**Everything a visitor reads is edited in the console, not in code:**

- **Pages** (`/console/pages`): every page is a stack of *sections* (hero,
  text, cards, text-and-image, FAQ, numbers, video, call to action, contact
  form, newsletter signup, latest posts/courses, business details...). Add,
  edit, drag to reorder, duplicate or delete sections; create new pages at
  any address (`/pricing`, `/services/web-design`); delete pages you don't
  want. Edits are saved as a draft and only go live when you click
  **Publish**; **Preview** shows the draft first.
- **Built-in pages** (`/courses`, `/blog`, `/tools`, `/webinars`,
  `/reviews`, `/newsletter`, `/terms`, `/privacy-policy`,
  `/refund-policy`) are edited the same way: their own content (the course
  list, the policy text...) is one movable section, so you can add sections
  around it, change the heading, or remove it and write the page yourself.
  "Reset to default" undoes everything.
- **Course and tool pages**: Course Studio has a *Sales page* tab, and each
  directory tool has *Page sections*, for extra sections under the page.
- **Menu & footer** (`/console/pages?tab=navigation`): header menu items
  and dropdowns, the header button, footer columns and tagline, and social
  links.
- **Business details** (`/console/site-settings`): legal name, owner,
  business type, registration number with your own label (Udyam, EIN,
  company number... or none), contact email/phone/hours, address, and the
  numbers the legal pages quote (refund window, minimum age, governing
  law). Every field is optional; blank ones are simply not shown.
- **Blog posts and directory listings**, as before.

Text fields accept placeholders such as `{{site_name}}`, `{{business_name}}`,
`{{email}}` and `{{phone}}`, filled in from the settings above.

**Moving content between sites:** Pages -> **Export** downloads every page
plus the menu/footer and business details as one JSON file; **Import** on
another deployment recreates them.

**Still set by environment variables** (deployment-level, see
`.env.example`): site name, site URL and asset domain
(`NEXT_PUBLIC_*`, `src/config/brand.ts`), plus credentials for each
integration. A few deeper pages still have copy in code: the voice-agent
product page, `/open-source`, `/apply-to-write`, and the reviews shown on
`/reviews` (`src/data/reviews.ts`).

## Stack & requirements

- Node 20, Next.js 16 (App Router)
- PostgreSQL (all app data: blog, directory, courses, contacts, console
  admins, API tokens, etc.)
- Everything else (email, storage, payments, WhatsApp, voice) is optional --
  the app runs with just the two above, and each integration quietly turns
  itself off if its env vars aren't set (see `src/config/features.ts`).

## Quick start (local dev)

```bash
npm install
cp .env.example .env.local   # fill in at minimum DATABASE_URL, SESSION_SECRET, ADMIN_EMAIL
npm run migrate              # applies scripts/migrations/*.sql against DATABASE_URL
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

`npm run migrate:status` shows which migrations are pending without running
anything. The migration runner is plain `pg` + `DATABASE_URL` -- no SSH,
no dependency on this project's own production access.

## Environment variables

`.env.example` documents every variable the app reads, grouped by what
they're for, with inline comments on anything non-obvious. A few matter
more than the rest for getting a usable deployment running:

- `DATABASE_URL`, `SESSION_SECRET` -- required, the app won't start usefully
  without them.
- `ADMIN_EMAIL` -- whoever logs in with this address becomes the one
  permanent console owner (see "Admin console" below).
- `EMAIL_FROM` + the `SES_*` vars (or swap in your own provider in
  `src/lib/email.ts`) -- the console login is a magic link, so without
  working outbound email **you cannot log into the console at all**.
- `TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY` -- every
  captcha-gated form (signup, contact, newsletter, etc.) fails closed in
  production if this isn't set, i.e. those forms silently stop accepting
  submissions, not silently skip the check.
- `NEXT_PUBLIC_SITE_NAME`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_ASSET_DOMAIN`,
  and `VOICE_AGENT_WS_URL` -- these all have to be passed as Docker build
  args, not just runtime env vars. The brand ones are `NEXT_PUBLIC_*`,
  which Next.js inlines into the client bundle at build time -- a value
  only set at container runtime never reaches client components like the
  nav logo. `VOICE_AGENT_WS_URL` isn't `NEXT_PUBLIC_*`, but
  `next.config.ts` reads it to build the CSP header, and that CSP is also
  computed once at build time for a standalone build, not per-request.
  The `Dockerfile` already declares `ARG`s for all of these; if you're
  building a different way, make sure your build step passes them
  through too.

Payments (Razorpay/PayPal), R2 storage, Mux video, Cal.com, Google Business
Profile, and WhatsApp are each fully optional -- leave their section blank
and that feature's console pages show a "not configured" state instead of
erroring.

## What's in the database vs. what isn't

Postgres holds: blog posts, tools-directory listings, courses, contacts,
community/forum content, console admins and API tokens, email templates,
and most other app state. Running `npm run migrate` creates all of this from
`scripts/migrations/*.sql`, applied in order and tracked in a
`schema_migrations` table.

Pages live in the `site_pages` table (migration 154); the menu/footer and
business details are JSON values in `site_settings`. The neutral starter
pages are created by the app the first time it runs (`src/lib/defaultPages.ts`),
not by a migration.

## Admin console

Visit `/console/login` and sign in with the address in `ADMIN_EMAIL` -- this
sends a magic link (so outbound email has to actually be working; see
above). That address is the permanent owner and can invite other admins
from `/console/team`, revocable at any time.

From the console you can manage the blog, tools directory, courses,
contacts, community, email/WhatsApp campaigns, payments settings, and site
configuration -- and from `/console/api-tokens` ("API & MCP access"), issue
a token to either:

- call the REST API directly (`/api/v1/*`, Bearer auth), or
- connect an AI agent over MCP -- point a remote MCP client (e.g. Claude) at
  `/api/mcp` with the token as a Bearer header, or run the local stdio
  server from this repo (`scripts/mcp/stdio.mjs`) against your deployed
  site.

Both the REST API and MCP tools are thin wrappers around the same
underlying logic, so they stay in sync by construction.

Pages, the menu/footer and business details are fully scriptable this way:
`/api/v1/pages` (list/create), `/api/v1/pages/:id` (get/update/delete),
`/api/v1/pages/:id/publish`, `/api/v1/pages/block-types` (the section
library with every field), `/api/v1/site/design` (the design system),
`/api/v1/site/navigation` and `/api/v1/site/business`, with the matching
MCP tools (`list_pages`, `create_page`, `update_page`, `publish_page`,
`list_page_block_types`, `get_design_system`, `update_navigation`,
`update_business_details`...). Tokens need the `pages:*` / `site:*`
scopes (or `*`).

### Designing a page, not filling in a template

The block library is a set of conveniences, not a ceiling. An agent that
only ever composes the stock sections (hero, then cards, then an FAQ) will
keep producing the same page with different words, because those are the
same sections the rest of the site is built from.

The `custom` block is the way out: one section, your own HTML, your own
real stylesheet, and optional JavaScript. The CSS is scoped to that one
section (see `src/lib/scopedCss.ts`), so bare `h2`/`p`/`.card` selectors
are safe and nothing leaks sitewide; `width: "full"` drops the site
container for an edge-to-edge design; `<script>` tags and the `js` field
actually run. **Tailwind utility classes do not work there** -- Tailwind
only emits classes written in this repo's own source, so a `class="grid
grid-cols-3"` stored in the database resolves to nothing. Write CSS.

`get_design_system` (`GET /api/v1/site/design`) is what makes that
on-brand rather than generic: the palette and its CSS variables, the two
fonts, the real layout measurements the stock sections use, the hosts this
deployment's CSP allows, and the handful of constraints that otherwise
fail silently. `update_design_notes` stores the site owner's own brand
direction alongside it, in the database -- this repo ships no opinion
about any one deployment's brand.

### Uploading an image over MCP

`upload_media_image` takes **`sourceUrl`** (a public image URL the server
downloads itself) or, on the local stdio server, **`filePath`** (a file on
the machine running it). Prefer either over `dataBase64`: inline base64
has to be written out inside the tool call, and base64 of even a 300KB
image is ~400,000 characters -- past what a tool call carries and past
what a model can emit, which surfaces as a size error that shrinking the
image never fixes. A URL or a path is a few dozen characters whatever the
image weighs. `sourceUrl` is fetched through the same SSRF-hardened
fetcher the rest of the app uses (public unicast IPs only, pinned after
DNS, capped redirects, hard byte ceiling).

## Deployment

The `Dockerfile` builds a standalone Next.js production image (multi-stage,
runs as a non-root user). It expects `DATABASE_URL` and the rest of
`.env.example`'s variables as container env vars at runtime, and the
`NEXT_PUBLIC_*` brand vars specifically as build args (see above). Any
Docker-based host (Coolify, Railway, Fly, a VPS) works; there's nothing
Coolify-specific in the app itself.

The container runs `scripts/migrate.mjs` against `DATABASE_URL` before
starting the server on every boot (a no-op once everything is applied), so
a brand-new database is schema'd automatically on first deploy -- you don't
need to run `npm run migrate` by hand in production. It does mean
`DATABASE_URL` has to point at a reachable, empty-or-matching Postgres
instance *before* the app's first start, and that deployment logs are the
place to look first if a deploy fails: a migration error there will stop
the container from starting, with a clear `<file>.sql: FAILED -- ...`
message, instead of the app coming up and failing at runtime with
confusing "relation ... does not exist" errors on whatever page a visitor
hits first.

**This app assumes it sits behind Cloudflare.** Login, signup, and most
other rate-limited endpoints key their per-IP throttling off the
`cf-connecting-ip` request header, which Cloudflare's edge sets and
strips from anything a client sends -- meaning it can't be spoofed *as
long as every request genuinely passes through Cloudflare first*. If you
deploy without Cloudflare (or an equivalent proxy that guarantees the
same header), that header is just an ordinary client-supplied value an
attacker can set to anything, defeating the rate limit entirely (it
doesn't bypass authentication itself, just the throttling around it).
Either put Cloudflare in front of your deployment, restrict your
origin/firewall to Cloudflare's published IP ranges (or enable Cloudflare's
Authenticated Origin Pulls), or swap this header for whatever your own
reverse proxy guarantees.

## Scripts

- `npm run dev` / `build` / `start` -- standard Next.js
- `npm run lint` / `typecheck` / `test` / `verify` (all three) -- the test
  suite is plain `node --test`, no separate runner to install
- `npm run migrate` / `migrate:status` -- database migrations
- `npm run audit:seo` -- a content/SEO audit script (see `docs/`)

## License

MIT -- see `LICENSE`.
