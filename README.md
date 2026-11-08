# OpenCloudCRM

A self-hosted business site + CRM, in one Next.js app: blog, tools
directory, courses, community, payments, email/WhatsApp marketing, and an
admin console. One app container, one Postgres database.

This is also the codebase behind [indishmarketer.com](https://www.indishmarketer.com).
A fresh install starts empty/neutral -- that site's own content isn't in
this repo.

<!-- Video walkthrough: add a link here -->

## Deploy it

You need two things: somewhere to run a Docker container, and a Postgres
database. `docker-compose.yml` in this repo gives you both, using a
**prebuilt image** -- nothing builds on your server, which matters: building
this app from source needs several GB of RAM and fails silently on a small
VPS (the build just gets killed, no error, deploy shows "failed").

### Coolify

**Deploy With AI Agents**

Let AI agents (Claude Code, Codex, Antigravity, OpenCode, etc.) do the whole thing through Coolify's own MCP server.

1. In Coolify (v4.5+), go to **Settings → Advanced**.
2. Enable **MCP Server** and **API Access**.
3. Copy your Coolify MCP server URL (`https://your-coolify-domain/mcp`).
4. Go to **Keys & Tokens → API Tokens**.
5. Create a new API token with **root** permissions. Keep the token secure, as it provides full access.
6. Connect your AI agent to the MCP server using the copied URL and API token as a Bearer credential.

   **For Claude Code:**

   ```bash
   claude mcp add --transport http coolify https://your-coolify-domain/mcp --header "Authorization: Bearer YOUR_TOKEN"
   ```

7. For other MCP-capable agents (Codex, Antigravity, OpenCode, etc.), add a remote MCP server using the same URL and Authorization header.
8. Give it this prompt:

   > Using the Coolify MCP tools connected to this session, deploy
   > OpenCloudCRM (https://github.com/indishmarketer/opencloudcrm) for me.
   >
   > Fetch the current `docker-compose.yml` from
   > https://raw.githubusercontent.com/indishmarketer/opencloudcrm/main/docker-compose.yml
   > and use it exactly as-is -- don't retype or edit it. Create a Docker
   > Compose service from it (`create_service`, `compose` mode), in
   > whichever project/server I confirm if more than one exists.
   >
   > Generate a strong random `DB_PASSWORD` and `SESSION_SECRET`, ask me
   > for the email to use as `ADMIN_EMAIL`, and set all three as
   > environment variables on the service.
   >
   > Deploy it, then check the logs: confirm the migration step finished
   > ("Nothing pending" or a list of applied migrations) and the server
   > started without crashing. Tell me the URL and confirm `/console/login`
   > is reachable. The homepage itself will say "not live yet" until
   > someone publishes a page from `/console/pages` -- that's expected on
   > a fresh install, not a sign anything is broken.
   >
   > If a migration fails: a migration that already succeeded is marked
   > done permanently on that database and will not re-run just because
   > its file changes later, so if you retry after a fix and see the
   > *exact same* error again, that's why -- don't keep redeploying.
   > Delete the service (with its volumes) and deploy fresh instead.

**Deploy Manually:**

1. **New Resource -> Docker Compose**, point it at this repo (branch
   `main`). If Coolify gives you an empty box instead of a Git source
   option, open [`docker-compose.yml`](docker-compose.yml) and paste its
   contents in. (If that box mangles the indentation on paste -- a known
   editor bug in some Coolify versions -- use the AI-agent path below
   instead; it goes through Coolify's API, not that editor.)
2. Fill in the environment variables it asks for -- at minimum:
   - `DB_PASSWORD` -- any strong password
   - `SESSION_SECRET` -- a long random string
   - `ADMIN_EMAIL` -- your email; whoever logs in with this address becomes
     the console owner
3. Deploy. Coolify creates two resources (the app and Postgres) and starts
   both -- each has a real health check (`docker-compose.yml`), so Coolify
   can tell you when the app is actually ready to serve requests, not just
   that the container started.
4. Visit your domain, then `/console/login`, and sign in with
   `ADMIN_EMAIL`. The homepage shows "not live yet" until you publish your
   first page from `/console/pages` -- that's expected, not a failed
   deploy.


**Already have this running and just want to update it?** 
Redeploy the same app resource -- don't switch it to Compose. Redeploying only rebuilds
that one container; it never touches your existing database. Migrations
only ever add (`CREATE TABLE IF NOT EXISTS`, etc.), never drop, so this is
safe even with real data in there.

**Stuck on a migration error on a brand-new (not yet real-data) deploy?**
A migration that completes successfully is marked done permanently for
that database -- re-deploying doesn't retry it, even after you (or a fix
from upstream) change that file's contents. If you're debugging a failed
first deploy, redeploying alone will not pick up a fix to an already-
applied migration; delete the service (**Danger Zone -> Delete Service**,
with volumes checked) and deploy fresh instead. If you have `DATABASE_URL`
for that database, `npm run migrate:status` tells you exactly what's
pending (or not) before you redeploy, rather than guessing.

**Pointing a Coolify app at a database you already have** (blue-green
testing an existing deployment, migrating from a different build method,
etc.), instead of the Docker Compose path above: create a standalone
application (**New Resource -> Docker Image**, `ghcr.io/indishmarketer/
opencloudcrm:latest`) rather than a Compose service, and set its
`DATABASE_URL` to the existing database's connection string. This path
has no built-in health check the way `docker-compose.yml`'s does --
Coolify shows `running:unknown` instead of `running:healthy`, which
doesn't mean anything is actually wrong, just that Coolify isn't
checking. Set one manually on the application (Health Checks tab, or
via the API/MCP): path `/api/health`, method `GET`, expected status
`200`. There's no way to make Coolify do this automatically for every
future app created this way -- it's a per-application setting, not a
platform default, so it needs setting again each time this pattern is
used.

### Any other Docker host (a VPS, Railway, Render, Fly...)

**Manually:**

```bash
git clone https://github.com/indishmarketer/opencloudcrm
cd opencloudcrm
cp .env.example .env   # fill in DB_PASSWORD, SESSION_SECRET, ADMIN_EMAIL
docker compose up -d
```

Same two resources, same prebuilt image, same result.

**Or hand it to an AI agent** with shell access to your server:

> Deploy OpenCloudCRM (https://github.com/indishmarketer/opencloudcrm) for
> me on [describe what you have -- e.g. "an Ubuntu VPS I can SSH into" or
> "Render"].
>
> Use `docker-compose.yml` from the repo root as-is. It pulls a prebuilt
> image from `ghcr.io/indishmarketer/opencloudcrm` and runs Postgres
> alongside it -- do not build the app from source on this server; the
> prebuilt image exists specifically so nothing has to build there.
>
> Generate a strong random `DB_PASSWORD` and `SESSION_SECRET`. Ask me for
> the email to use as `ADMIN_EMAIL` (whoever logs in with it becomes the
> console owner) and my domain if I have one. Clone the repo, write the
> variables to a `.env` file next to `docker-compose.yml`, and run
> `docker compose up -d`.
>
> Confirm the app container's logs show the migration step finishing
> ("Nothing pending" or a list of applied migrations) and the server
> starting, not crashing. Then tell me the URL and confirm I can log in at
> `/console/login` with `ADMIN_EMAIL`. The homepage itself will say "not
> live yet" until a page is published from `/console/pages` -- that's
> expected on a fresh install. If anything fails, show me the actual
> error instead of guessing.
>
> If a migration fails: a migration that already succeeded is marked
> done permanently in that database and won't re-run just because its
> file changes later, so retrying after a fix with just `docker compose
> up -d` won't help -- you'll see the exact same error. Run `docker
> compose down -v` (removes the database volume too) and `docker compose
> up -d` again instead, so migrations run fresh from an empty database.

## What it is

- Everything a visitor reads -- pages, menu, footer, business details,
  blog posts, directory listings -- is edited from `/console`, not in
  code. A fresh install ships neutral starter pages as unpublished drafts
  (the live site shows "not live yet" until you publish one) -- edit and
  publish from `/console/pages` rather than going live with placeholder
  copy nobody wrote.
- Postgres holds all of it. `npm run migrate` (or the Docker image's own
  startup step) applies `scripts/migrations/*.sql` in order.
- Payments, storage, video, WhatsApp, and SSO are each optional --
  unconfigured ones just show "not set up" in the console instead of
  erroring.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL, SESSION_SECRET, ADMIN_EMAIL
npm run migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). `npm run migrate:status`
shows what's pending without running anything.

## Configuration

`.env.example` documents every variable. `DATABASE_URL`, `SESSION_SECRET`,
and `ADMIN_EMAIL` are the only ones required to get a usable deployment;
everything else is optional and documented inline where it matters (e.g.
outbound email is required for console login, since that's a magic link).

## Admin & API access

Console: `/console/login`, magic-link sign-in with `ADMIN_EMAIL`. Invite
other admins from `/console/team`.

Issue a token from `/console/api-tokens` for either the REST API
(`/api/v1/*`, Bearer auth) or MCP (`/api/mcp`, or run the local stdio
server in `scripts/mcp/stdio.mjs`). Both cover the same ground -- pages,
navigation, business details, blog, and more -- and stay in sync since one
wraps the other.

## A security note on deploying without Cloudflare

Rate limiting (login, signup, contact forms) keys off the
`cf-connecting-ip` header, which only Cloudflare can set trustworthily.
Without Cloudflare (or an equivalent proxy) in front of your deployment,
that header becomes spoofable and your rate limits stop doing anything.
Put Cloudflare in front, restrict your origin to Cloudflare's IP ranges,
or adapt the header in `next.config.ts` to whatever your own proxy
guarantees.

## Scripts

- `npm run dev` / `build` / `start` -- standard Next.js
- `npm run lint` / `typecheck` / `test` / `verify` (all three)
- `npm run migrate` / `migrate:status`
- `npm run audit:seo` -- content/SEO audit

## License

MIT -- see [`LICENSE`](LICENSE).
