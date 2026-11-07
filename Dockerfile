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
# Not a NEXT_PUBLIC_* var, but next.config.ts's headers() (the CSP) is also
# evaluated once at build time for a standalone build, not per-request --
# so the voice-agent domain it derives from this needs to be known now too,
# same build-time constraint as the brand vars above (see next.config.ts).
ARG VOICE_AGENT_WS_URL
ENV VOICE_AGENT_WS_URL=$VOICE_AGENT_WS_URL
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
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrations ./scripts/migrations

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Fresh deployments (a new Coolify app pointed at a brand-new Postgres
# database) start with zero tables. Running the migration runner on every
# boot -- it's a no-op once everything is applied -- is what makes a
# one-click deploy actually come up usable instead of failing at runtime
# with "relation ... does not exist" the first time a visitor hits a page
# that queries it (this is how the WhatsApp tables went missing for
# people deploying the public repo: nobody had run `npm run migrate`).
CMD ["sh", "-c", "node scripts/migrate.mjs && node server.js"]
