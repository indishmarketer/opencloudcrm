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

1. **New Resource -> Docker Compose**, point it at this repo (branch
   `main`). If Coolify gives you an empty box instead of a Git source
   option, open [`docker-compose.yml`](docker-compose.yml) and paste its
   contents in.
2. Fill in the environment variables it asks for -- at minimum:
   - `DB_PASSWORD` -- any strong password
   - `SESSION_SECRET` -- a long random string
   - `ADMIN_EMAIL` -- your email; whoever logs in with this address becomes
     the console owner
3. Deploy. Coolify creates two resources (the app and Postgres) and starts
   both.
4. Visit your domain, then `/console/login`, and sign in with
   `ADMIN_EMAIL`.

**Already have this running and just want to update it?** Redeploy the
same app resource -- don't switch it to Compose. Redeploying only rebuilds
that one container; it never touches your existing database. Migrations
only ever add (`CREATE TABLE IF NOT EXISTS`, etc.), never drop, so this is
safe even with real data in there.

### Any other Docker host (a VPS, Railway, Render, Fly...)

```bash
git clone https://github.com/indishmarketer/opencloudcrm
cd opencloudcrm
cp .env.example .env   # fill in DB_PASSWORD, SESSION_SECRET, ADMIN_EMAIL
docker compose up -d
```

Same two resources, same prebuilt image, same result.

### Let an AI agent deploy it for you

Give this to Claude Code, Cursor, or any agent that has access to your
server (SSH, a Coolify API token, or just a terminal):

> Deploy OpenCloudCRM (https://github.com/indishmarketer/opencloudcrm) for
> me on [describe what you have -- e.g. "my Coolify instance at
> https://..." or "an Ubuntu VPS I can SSH into" or "Render"].
>
> Use `docker-compose.yml` from the repo root as-is. It pulls a prebuilt
> image from `ghcr.io/indishmarketer/opencloudcrm` and runs Postgres
> alongside it -- do not build the app from source on this server; the
> prebuilt image exists specifically so nothing has to build there.
>
> Generate a strong random `DB_PASSWORD` and `SESSION_SECRET`. Ask me for
> the email to use as `ADMIN_EMAIL` (whoever logs in with it becomes the
> console owner) and my domain if I have one.
>
> If I'm on Coolify: create a Docker Compose resource pointed at this
> repo, set the variables, and deploy. If I'm on a plain server: clone the
> repo, write the variables to a `.env` file next to `docker-compose.yml`,
> and run `docker compose up -d`.
>
> Confirm the app container's logs show the migration step finishing
> ("Nothing pending" or a list of applied migrations) and the server
> starting, not crashing. Then tell me the URL and confirm I can log in at
> `/console/login` with `ADMIN_EMAIL`. If anything fails, show me the
> actual error instead of guessing.

## What it is

- Everything a visitor reads -- pages, menu, footer, business details,
  blog posts, directory listings -- is edited from `/console`, not in
  code. A fresh install ships neutral starter pages you replace with your
  own.
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
