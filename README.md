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
integration. A few deeper pages still have copy in code: `/open-source`,
`/apply-to-write`, and the reviews shown on `/reviews`
(`src/data/reviews.ts`).

## Stack & requirements

- Node 20, Next.js 16 (App Router)
- PostgreSQL (all app data: blog, directory, courses, contacts, console
  admins, API tokens, etc.)
- Everything else (email, storage, payments, WhatsApp) is optional --
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
- `NEXT_PUBLIC_SITE_NAME`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_ASSET_DOMAIN`
  -- these all have to be passed as Docker build args, not just runtime
  env vars. Next.js inlines `NEXT_PUBLIC_*` into the client bundle at
  build time -- a value only set at container runtime never reaches
  client components like the nav logo. The `Dockerfile` already declares
  `ARG`s for all of these; if you're building a different way, make sure
  your build step passes them through too.

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

### Updating an existing deployment

If you already have this running somewhere (an existing Coolify app
resource pointed at this repo, with its own Postgres resource), **just
redeploy that same app** -- don't switch it to the Docker Compose setup
below. Redeploying rebuilds and restarts only the app container; it never
touches, recreates, or drops the separate database resource, which is why
this is safe:

- `scripts/migrate.mjs` only ever adds: every statement in every migration
  is `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT
  EXISTS`, or similar. It tracks what's already applied in a
  `schema_migrations` table and only runs what's new -- it has no DROP,
  no destructive step, and no code path that touches existing rows in a
  way that loses data.
- Your database is a separate resource with its own volume. Nothing in
  the app's Dockerfile or deploy process creates, deletes, or resets it.

Want to check what a redeploy would actually do before running it? If you
have the `im_website_db` MCP connected (or an equivalent read-only
connection to your own database), `migration_status` lists every
migration file against what your database already has applied, with zero
risk -- it only reads. "0 pending" means a redeploy runs no migration SQL
at all, it just restarts the server.

One thing that read can surface, and is worth understanding rather than
worrying about: a database that's been running a while may show
migrations tracked as applied that no longer have a matching file in
`scripts/migrations/`. That isn't data loss or a broken deploy -- it
means a migration ran at some point (by hand, by an earlier version of
this repo, or via a direct database tool) and its `.sql` file was later
removed from the repo, often deliberately, e.g. a one-off script that
seeded this specific site's own real page content or review data, which
by design (see "What you actually get" above) doesn't belong in the
public repo at all. The migration already ran; removing the file
afterward doesn't undo it. If a name looks unfamiliar, treat it as
history, not a problem -- nothing reruns anything by deleting a file.

### Recommended: `docker-compose.yml`, prebuilt images

For a **new** deployment (nothing running yet, no existing database to
preserve) -- if you already have one running, see "Updating an existing
deployment" above instead.

Building this app from source (`npm run build` inside the Dockerfile) needs
several GB of RAM -- a large TypeScript project with hundreds of pages.
That's genuinely heavy, and on a smaller VPS it fails silently: the build
gets OOM-killed mid-compile with no error in the logs, just "failed". If
you hit that, this is why, and **more swap or a smaller build doesn't fully
fix it** -- the real fix is to not build on that machine at all.

`.github/workflows/docker-publish.yml` builds the app on GitHub's own
runners (free for this public repo) on every push to `main`, and publishes
it to GitHub Container Registry. `docker-compose.yml` at the repo root
pulls that prebuilt image plus a `postgres:16-alpine` service, so
`docker compose up` needs only a few hundred MB to bring up both
resources -- no build step runs on your server at all.

In Coolify, **New Resource -> Docker Compose** offers two ways to fill
that in: pointing it at a Git source (which then reads `docker-compose.yml`
from this repo automatically on every deploy), or an empty box for pasting
compose content directly. If you get the empty box, open
[`docker-compose.yml`](docker-compose.yml) in this repo and paste its
contents in as-is -- it's the same file either way, pasting just means
Coolify won't auto-update its copy if this file changes later, so a Git
source is preferable when that option is offered.

Set `DB_PASSWORD`, `SESSION_SECRET`, and `ADMIN_EMAIL` at minimum (see the
`:?` markers in `docker-compose.yml`); the rest of `.env.example`'s
variables are optional and each integration quietly turns itself off
without them.

**What the prebuilt image doesn't give you:** the `NEXT_PUBLIC_*` brand
vars are inlined into the app at build time (see above), and a single
shared image can't carry a different value per deployer's domain -- so
the published image builds with none of them set. The site name/logo
shown to visitors comes from the console (`getSiteIdentity()`/
`site_settings`, same as any fresh install) and is unaffected -- set it
from `/console/login` once you're in. `NEXT_PUBLIC_SITE_URL`'s fallback
(`https://example.com`) still ends up in `metadataBase` and a couple of
SEO tags (canonical URLs, OG image absolute URLs) until you build your
own image -- cosmetic, not functional.

If you want that fully correct, fork this repo, set your own
`NEXT_PUBLIC_SITE_URL`/`NEXT_PUBLIC_SITE_NAME`/`NEXT_PUBLIC_ASSET_DOMAIN`
(as repository variables, read into the same `docker-publish.yml`
workflow as build args), and let your fork's own Actions build your own
correctly-branded image -- still on GitHub's runners, never on your own
server.

### Building from source instead

If you'd rather build on your own server (the plain `Dockerfile`, no
compose file), give it real headroom: **4+ GB of RAM free during the build
step**, separate from whatever Coolify/Docker itself is already using. On
anything smaller, add swap before you deploy, not after a mysterious
"failed" -- a few GB of swap is enough to turn a silent OOM-kill into a
successful (if slower) build.

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
