# Coolify deployment with rolling web updates

Use this layout for a public site that should keep serving visitors while a
new web image starts. Coolify can overlap containers for a standalone Docker
Image application. It cannot do that for a Docker Compose service. A first
deployment still has to wait for the first container to become ready.

For a **fresh installation**, `node deployment/coolify/create.mjs` automates
the two-resource layout below. See the required variables in the
[README](../README.md#coolify-two-resources-zero-downtime-updates). This command creates one database and one web
application, then places scheduled tasks on the web application. It does not
migrate an existing Compose site or its database.

## Create the resources

1. Create a **PostgreSQL** database resource in Coolify, in the same server
   and destination as the application. Start it and wait for `running:healthy`.
   Keep its persistent volume and configure backups. Copy its **Internal URL**.
2. Create an **Application → Docker Image** resource. Use image
   `ghcr.io/indishmarketer/opencloudcrm` and tag `latest` (or a pinned
   `sha-<commit>` tag). Set the exposed container port to `3000` and assign
   your public domain. Leave **host port mapping**, **consistent/custom
   container name**, and **custom IP** empty. Those settings prevent Coolify
   from running old and new web containers together.
3. Set these application environment variables at runtime:
   - `DATABASE_URL`: the database's Internal URL.
   - `SESSION_SECRET`: a long random string; keep it the same across updates.
   - `ADMIN_EMAIL`: the console owner's email.
   - `SITE_URL`: the public origin, for example `https://example.com`.
   - `CRON_SECRET`: a different long random string for scheduled jobs.

   Add email, storage, payment, and other integration variables from
   [`.env.example`](../.env.example) only when you use those features.
4. Configure an HTTP health check on `GET /api/health`, expected status
   `200`. The image also contains this check; confirm Coolify detects it.
   Deploy and wait for `running:healthy`. The image applies pending database
   migrations before starting the web server.

## Schedule background jobs

Create these **Scheduled Tasks** on the standalone application. Coolify runs
each command inside its running container, where `CRON_SECRET` is available.
Schedules use the deployment server's timezone.

| Task | Frequency | Command | Timeout |
| --- | --- | --- | --- |
| Reminders | `* * * * *` | `sh /app/scripts/cron/run-once.sh minute` | 120 seconds |
| Email and webhooks | `*/5 * * * *` | `sh /app/scripts/cron/run-once.sh five-minute` | 120 seconds |
| Daily maintenance | `0 2 * * *` | `sh /app/scripts/cron/run-once.sh daily` | 1200 seconds |

The daily task runs course follow-ups. It also runs database backup when
`BACKUP_ENABLED=true`, and meeting reconciliation when `CALCOM_ENABLED=true`.
Configure the associated integrations before enabling either optional job.
Run each task once from Coolify and check its execution result. Do not also
start the Compose scheduler against the same site.

## Verify an update

1. Confirm the new image has finished publishing on GitHub before deploying
   a mutable `latest` tag.
2. Keep requesting a public page and `/api/health` throughout a deployment.
3. In the Coolify deployment log, confirm `Rolling update started`, `New
   container is healthy`, and `Rolling update completed` appear in that order.
4. Confirm the database, login, and scheduled tasks still work. Keep schema
   migrations compatible with the old web version while old and new
   containers overlap.

A successful health check improves the handoff, but it does not guarantee
every in-flight request or transaction succeeds. Test real traffic before
depending on uninterrupted updates.

## Existing Docker Compose installations

The root [`docker-compose.yml`](../docker-compose.yml) remains a simple
single-server setup. Coolify replaces its web container in place during
updates, so it can briefly return 503 even though all three containers have
health checks. Changing only the health-check interval cannot remove that
gap. The fresh-install command above creates a new database, so **never run it
against an existing production site**. To migrate, first take and verify a
backup of the existing database. Create a standalone web application against
that same database on a private network, without taking the existing site
offline. Copy all application environment variables and confirm the new web
container can serve traffic through a temporary domain. Set up its scheduled
tasks, then switch the public domain and remove the old web app and scheduler
from the Compose service. Keep the database and its volume throughout. Only
remove the old service after the database has been moved to a standalone
resource and its data has been verified. Check server capacity before the
handoff: two web containers must fit briefly. Migration needs a site-specific
cutover plan; editing the root Compose file alone cannot perform it.
