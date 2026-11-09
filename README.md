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

You need a web application and a PostgreSQL database. For a public Coolify
site, create them as **two separate Coolify resources** using the setup command
below. In normal operation, that is one web container and one database
container. During a web update, Coolify temporarily runs **two web containers
and one database container**, waits for the new web container's health check,
then removes the old web container. The server needs enough spare memory for
that temporary overlap.

**A Dockerfile cannot create the database or choose a host's update policy.**
The root `docker-compose.yml` can start the web app and database together, but
Coolify does not roll its Compose services. Redeploying that layout can return
503 while its only web container is replaced. This is also true of plain
`docker compose up` on a VPS. Other platforms need their own deployment
settings; this repository cannot force a universal zero-downtime guarantee.
The application image is prebuilt on GitHub, so a small server does not need
to build Next.js itself.

### Coolify

**Recommended for a new public site:** Run the repo's
[`deployment/coolify/create.mjs`](deployment/coolify/create.mjs) setup command.
It creates one standalone PostgreSQL database and one standalone Docker Image
application, connects them privately, enables the `/api/health` check, and
adds scheduled tasks to the web app. It does **not** create a permanent second
web application or a separate scheduler resource. It leaves host port mapping
and fixed container naming unset, which lets Coolify overlap the old and new
web containers during an update. It is for **fresh installs only**; do not run
it against an existing site or database. For an existing Compose site, see the
migration section in [Coolify rolling deployment](docs/coolify-rolling-deployment.md)
and preserve its database before changing resources.

Set these variables in your shell, then run `node deployment/coolify/create.mjs`:

| Variable | Meaning |
| --- | --- |
| `COOLIFY_URL` | Your trusted Coolify origin, such as `https://coolify.example.com` |
| `COOLIFY_TOKEN` | Coolify API token with resource write and deploy permissions |
| `COOLIFY_PROJECT_UUID` | Target project UUID |
| `COOLIFY_ENVIRONMENT_UUID` | Target environment UUID |
| `COOLIFY_SERVER_UUID` | Target server UUID |
| `SITE_URL` | New public site origin, such as `https://example.com` |
| `ADMIN_EMAIL` | Console owner's email |

Optional: `COOLIFY_DESTINATION_UUID` if the server has multiple destinations,
`OPEN_CLOUD_CRM_IMAGE_TAG` to pin an image instead of `latest`, and
`APP_ENV_FILE` for additional `KEY=value` application variables such as email
and storage credentials. Keep that file private. The command generates the
database password, session secret, and cron secret; it prints resource IDs but
never secret values. Run with `--dry-run` to check inputs without creating
anything. If setup stops halfway, use the printed IDs to inspect the resources
in Coolify **before retrying**; a retry creates another database.

The detailed manual setup and update verification are in
[Coolify rolling deployment](docs/coolify-rolling-deployment.md). A successful
health check makes the handoff safer, but it cannot guarantee that every
request succeeds. Confirm a rolling update with continuous requests to the
public URL before relying on uninterrupted updates.

To deploy through a Coolify MCP-capable agent instead, enable **MCP Server**
and **API Access** in Coolify, create an API token with the needed project,
resource, and deploy permissions, and connect your agent to
`https://your-coolify-domain/mcp` with that token. Then give it this one prompt:

> Deploy OpenCloudCRM from `ghcr.io/indishmarketer/opencloudcrm:latest`
> using the **standalone Docker Image application** and **standalone
> PostgreSQL database** layout in
> `https://github.com/indishmarketer/opencloudcrm/blob/main/docs/coolify-rolling-deployment.md`.
> Follow the environment, health-check, and scheduled-task steps there.
> Do not create a Docker Compose service or publish a host port. Verify a
> rolling update with continuous HTTP requests before saying updates are
> uninterrupted.

**Alternative: Docker Compose.** This is simpler to run, but its web container
is replaced during updates, so a public site can briefly return 503.

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

For updates to a standalone app, redeploy the application resource. Coolify
keeps the old web container while the new one becomes healthy. Keep database
migrations compatible with both versions during that overlap. For existing
Compose sites and troubleshooting, see the
[deployment guide](docs/coolify-rolling-deployment.md).

### Plain Docker Compose on a VPS

**Manually:**

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
