FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
WORKDIR /app
# The production type-check for this app exceeds Node's default ~2 GiB heap.
# Give the build process a larger heap; this setting stays in the builder stage.
ENV NODE_OPTIONS=--max-old-space-size=3072
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_META_PIXEL_ID
ENV NEXT_PUBLIC_META_PIXEL_ID=$NEXT_PUBLIC_META_PIXEL_ID
ARG NEXT_PUBLIC_GA4_MEASUREMENT_ID
ENV NEXT_PUBLIC_GA4_MEASUREMENT_ID=$NEXT_PUBLIC_GA4_MEASUREMENT_ID
# Next.js inlines every NEXT_PUBLIC_* var into the client bundle at build
# time, not read at container runtime -- a brand var set only as a Coolify
# runtime env var (with no matching ARG here) would never reach client
# components like the nav logo (src/components/NavClient.tsx), which would
# keep showing the Indish Marketer default forever regardless of what's
# configured. NAME/URL/ASSET_DOMAIN are what src/config/brand.ts reads.
# The SOCIAL_* ones are legacy: social links now live in the console
# (Pages -> Menu & footer) and these only apply until that's saved once.
ARG NEXT_PUBLIC_SITE_NAME
ENV NEXT_PUBLIC_SITE_NAME=$NEXT_PUBLIC_SITE_NAME
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_ASSET_DOMAIN
ENV NEXT_PUBLIC_ASSET_DOMAIN=$NEXT_PUBLIC_ASSET_DOMAIN
ARG NEXT_PUBLIC_SOCIAL_FACEBOOK
ENV NEXT_PUBLIC_SOCIAL_FACEBOOK=$NEXT_PUBLIC_SOCIAL_FACEBOOK
ARG NEXT_PUBLIC_SOCIAL_X
ENV NEXT_PUBLIC_SOCIAL_X=$NEXT_PUBLIC_SOCIAL_X
ARG NEXT_PUBLIC_SOCIAL_YOUTUBE
ENV NEXT_PUBLIC_SOCIAL_YOUTUBE=$NEXT_PUBLIC_SOCIAL_YOUTUBE
ARG NEXT_PUBLIC_SOCIAL_LINKEDIN
ENV NEXT_PUBLIC_SOCIAL_LINKEDIN=$NEXT_PUBLIC_SOCIAL_LINKEDIN
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
# curl is required for Coolify's container health check (docker exec curl);
# without it the check can never pass and every deploy silently rolls back.
# postgresql16-client provides pg_dump, used by the daily DB backup cron
# route (src/app/api/cron/db-backup/route.ts) to export straight from this
# container's own DATABASE_URL, no separate backup infra needed.
RUN apk add --no-cache curl postgresql16-client
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Not traced into the standalone output (nothing in the app imports them),
# but needed at runtime so a fresh deploy can create its own schema --
# see the entrypoint below and scripts/migrate.mjs.
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/graceful-server.mjs ./scripts/graceful-server.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrations ./scripts/migrations
COPY --from=builder --chown=nextjs:nodejs /app/scripts/cron ./scripts/cron
COPY --from=builder --chown=nextjs:nodejs /app/scripts/submit-search-sitemap.mjs ./scripts/submit-search-sitemap.mjs

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# Stops Next.js installing its own SIGTERM handler, which calls
# process.exit(143) the instant the signal lands and cuts off whatever
# requests are in flight. scripts/graceful-server.mjs installs handlers
# of its own instead -- see the comment at the top of that file for the
# two measured failure modes this addresses. Setting this WITHOUT that
# wrapper would leave the container with no SIGTERM handling at all.
ENV NEXT_MANUAL_SIG_HANDLE=true

# Readiness check for rolling updates. The Compose scheduler overrides it
# with its own loop health check.
#
# The numbers matter more than they look. A rolling update keeps the old
# container serving until the new one reports healthy, so this interval is
# what decides how long BOTH containers sit behind the proxy at once, and
# during that overlap two different builds of the same Next.js app answer
# requests round-robin. Their /_next/static chunk filenames are
# content-hashed, so HTML served by one container asks the other for files
# it has never heard of. A short interval plus a short start period keeps
# that window down to seconds.
#
# start-period was 180s, which is not a grace period in the usual sense:
# Coolify sleeps the whole of it before it will even look at the first
# check, so every deploy cost three minutes and spent all of them with two
# builds live. This app answers /api/health in roughly 15 seconds from a
# cold start, migrations included. 15s + 30 retries x 5s still leaves 165
# seconds before anything is declared unhealthy, which is an order of
# magnitude more headroom than a real boot needs.
HEALTHCHECK --interval=5s --timeout=4s --start-period=15s --retries=30 \
  CMD curl -fsS http://127.0.0.1:3000/api/health >/dev/null || exit 1

# Fresh deployments (a new Coolify app pointed at a brand-new Postgres
# database) start with zero tables. Running the migration runner on every
# boot -- it's a no-op once everything is applied -- is what makes a
# one-click deploy actually come up usable instead of failing at runtime
# with "relation ... does not exist" the first time a visitor hits a page
# that queries it (this is how the WhatsApp tables went missing for
# people deploying the public repo: nobody had run `npm run migrate`).
# The `exec` makes explicit what busybox ash already did by luck. Its
# `-c` handling tail-call-execs a final simple command, so node was in
# fact already PID 1 here -- verified on the running container, where
# /proc/1/exe pointed at /usr/local/bin/node rather than at sh. SIGTERM
# was therefore reaching node all along, and Next.js's own handler
# exiting on the spot is what cut requests off, which is what the
# wrapper above addresses. Spelling out the exec keeps that true if the
# command ever grows a third stage, where the optimisation stops
# applying and the shell would stay PID 1 and swallow the signal.
CMD ["sh", "-c", "node scripts/migrate.mjs && exec node scripts/graceful-server.mjs"]
