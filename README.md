# OpenCloudCRM

A self-hosted business site + CRM, in one Next.js app: blog, tools
directory, courses, community, payments, email/WhatsApp marketing, and an
admin console. One app container, one Postgres database.

This is also the codebase behind [indishmarketer.com](https://www.indishmarketer.com).
A fresh install starts empty/neutral -- that site's own content isn't in
this repo.

Hit something broken on your own deployment? [Open an issue](https://github.com/indishmarketer/opencloudcrm/issues/new?template=bug_report.md) --
the maintainer's own production site can't reproduce most fresh-install
bugs (it's long past that state), so this is the only way they get seen.

<!-- Video walkthrough: add a link here -->

## Deploy it

You need one web container and one PostgreSQL database. Pick a path:

| Path | Downtime on updates | Effort |
| --- | --- | --- |
| [Coolify, two resources](#coolify-two-resources-zero-downtime-updates) | None (rolling) | One command, or an AI agent |
| [Coolify, Docker Compose](#coolify-docker-compose-simplest) | Brief 503 | A few clicks |
| [Plain Docker Compose on a VPS](#plain-docker-compose-on-a-vps) | Brief 503 | A few commands |

The app image is prebuilt on GitHub (`ghcr.io/indishmarketer/opencloudcrm`),
so even a small server doesn't need to build Next.js itself -- building from
source needs several GB of RAM and can fail silently on a small VPS.

### Coolify, two resources (zero-downtime updates)

**Why two resources:** a single Docker Compose service gets replaced in
place during an update, so the site can briefly return 503. A standalone
Postgres database plus a standalone Docker Image application let Coolify
start the new web container, wait for its health check, and only then remove
the old one. Make sure the server has enough spare memory to run both web
containers briefly during that handoff.

Pick **one** of these three ways to create the resources:

**1. Run the setup script**

1. In your Coolify dashboard, open the project, environment, and server you
   want to deploy to -- each one's UUID is in the browser address bar.
2. In Coolify, go to **Keys & Tokens** and create an API token with resource
   write and deploy permissions.
3. Run:
   ```bash
   COOLIFY_URL=https://coolify.example.com \
   COOLIFY_TOKEN=your-token \
   COOLIFY_PROJECT_UUID=your-project-uuid \
   COOLIFY_ENVIRONMENT_UUID=your-environment-uuid \
   COOLIFY_SERVER_UUID=your-server-uuid \
   SITE_URL=https://example.com \
   ADMIN_EMAIL=you@example.com \
   node deployment/coolify/create.mjs
   ```
   This creates the database and the web app, connects them, and adds the
   three scheduled jobs below. It generates the database password, session
   secret, and cron secret itself, and only ever prints resource IDs, never
   secret values.

   Optional variables: `COOLIFY_DESTINATION_UUID` (server has multiple
   destinations), `OPEN_CLOUD_CRM_IMAGE_TAG` (pin a version instead of
   `latest`), `APP_ENV_FILE` (path to extra `KEY=value` vars, e.g. email or
   storage credentials -- keep that file private). Add `--dry-run` to check
   your inputs without creating anything.

   **Fresh installs only.** If you're moving an *existing* Compose site to
   this layout, use the migration steps in
   [Coolify rolling deployment](docs/coolify-rolling-deployment.md#existing-docker-compose-installations)
   instead -- re-running this script creates a brand new, empty database.
   If it stops halfway, inspect the printed resource IDs in Coolify before
   retrying; retrying creates a second database.

**2. Let an AI agent do it, through Coolify's own MCP server**

1. In Coolify (v4.5+): **Settings -> Advanced**, enable **MCP Server** and
   **API Access**.
2. **Keys & Tokens -> API Tokens**, create a token with project, resource,
   and deploy permissions.
3. Connect your agent to `https://your-coolify-domain/mcp` with that token.
   For Claude Code:
   ```bash
   claude mcp add --transport http coolify https://your-coolify-domain/mcp --header "Authorization: Bearer YOUR_TOKEN"
   ```
   Other MCP-capable agents (Codex, Antigravity, OpenCode, etc.): add a
   remote MCP server using the same URL and `Authorization` header.
4. Give it this prompt:
   > Deploy OpenCloudCRM from `ghcr.io/indishmarketer/opencloudcrm:latest`
   > using the **standalone Docker Image application** and **standalone
   > PostgreSQL database** layout in
   > `https://github.com/indishmarketer/opencloudcrm/blob/main/docs/coolify-rolling-deployment.md`.
   > Follow the environment, health-check, and scheduled-task steps there.
   > Do not create a Docker Compose service or publish a host port. Verify a
   > rolling update with continuous HTTP requests before saying updates are
   > uninterrupted.

**3. Click through it manually** -- the full step-by-step is in
[Coolify rolling deployment](docs/coolify-rolling-deployment.md).

**Updating later:** redeploy the application resource, not the database.
Coolify keeps the old web container serving traffic until the new one passes
its health check, then removes it. A successful health check makes the
handoff safer, but it doesn't guarantee every in-flight request succeeds --
confirm with continuous requests to the public URL before relying on
uninterrupted updates.

### Coolify, Docker Compose (simplest)

1. **New Resource -> Docker Compose**, point it at this repo (branch
   `main`). If Coolify gives you an empty box instead of a Git source
   option, open [`docker-compose.yml`](docker-compose.yml) and paste its
   contents in.
2. Fill in the environment variables it asks for -- at minimum:
   - `DB_PASSWORD` -- any strong password
   - `SESSION_SECRET` -- a long random string
   - `CRON_SECRET` -- a separate long random string used by the scheduler
   - `SITE_URL` -- the public site origin, such as `https://your-domain.com`
   - `ADMIN_EMAIL` -- your email; whoever logs in with this address becomes
     the console owner
3. Deploy. Coolify starts the app, scheduler, and Postgres inside a single
   Compose service. All three containers have health checks.
4. Visit your domain, then `/console/login`, and sign in with
   `ADMIN_EMAIL`. The homepage shows "not live yet" until you publish your
   first page from `/console/pages` -- that's expected, not a failed
   deploy.

Updating: redeploying this service replaces its only web container, so the
site can briefly return 503.

### Plain Docker Compose on a VPS

```bash
git clone https://github.com/indishmarketer/opencloudcrm
cd opencloudcrm
cp .env.example .env   # add DB_PASSWORD; set SESSION_SECRET, CRON_SECRET,
                       # ADMIN_EMAIL, and SITE_URL before starting
docker compose up -d
```

The app, scheduler, and database use the prebuilt image and Compose
configuration. Plain `docker compose up` also replaces the single web
container during updates; use an orchestrator with rolling updates if a
brief interruption is unacceptable.

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

`.env.example` documents every variable. Compose requires `DB_PASSWORD`,
`SESSION_SECRET`, `ADMIN_EMAIL`, `CRON_SECRET`, and `SITE_URL`; it builds `DATABASE_URL`
from the database service. A standalone image requires `DATABASE_URL` instead
of `DB_PASSWORD`. Everything else is optional and documented inline where it matters (e.g.
outbound email is required for console login, since that's a magic link).

The Compose scheduler calls reminder routes every minute, email and outbound
webhook dispatch every five minutes, and maintenance daily. Set
`BACKUP_ENABLED=true` after configuring R2 backup storage, and
`CALCOM_ENABLED=true` after configuring Cal.com to enable those daily jobs.
For a standalone Coolify application, use the three scheduled tasks in
[Coolify rolling deployment](docs/coolify-rolling-deployment.md). They call
[`scripts/cron/run-once.sh`](scripts/cron/run-once.sh) inside the container.
Before sending mail, set `EMAIL_FROM` to an address verified by your email
provider and enter your business address in Console → Site Settings.

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
