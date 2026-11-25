# Base images are pinned by digest (tag kept for reading), so a rebuild gets
# exactly the image that was tested, not whatever the tag points at that day.
# Pinned 2026-11-25: bun 1.2.23 (alpine), node 22.23.5 (alpine 3.24).
# To refresh (security updates): read the multi-arch digest of each tag,
#   docker buildx imagetools inspect oven/bun:1.2-alpine | grep -m1 Digest
#   docker buildx imagetools inspect node:22-alpine | grep -m1 Digest
# replace the sha256 in every FROM below (and in the other Dockerfile), then
# rebuild both images and run the checks before deploying.

# Stage 1: Install all workspace dependencies
FROM oven/bun:1.2-alpine@sha256:0841c588f6304300baf1d395ae339ce09a6e18c4b6a7cdd4fddcbdb87a2f096a AS deps
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN bun install --frozen-lockfile

# Stage 2: Build server bundle with esbuild
FROM oven/bun:1.2-alpine@sha256:0841c588f6304300baf1d395ae339ce09a6e18c4b6a7cdd4fddcbdb87a2f096a AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bunfig.toml tsconfig.json ./
COPY server/ ./server/
COPY shared/ ./shared/
RUN node ./server/build.mjs

# Stage 3: Production runtime
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS runner
WORKDIR /app
ENV NODE_ENV=production
# su-exec: the entrypoint starts as root only to hand the uploads volume to the
# unprivileged "node" user (uid 1000), then runs migrations and the server as it.
RUN apk add --no-cache su-exec
# Compiled server bundle
COPY --from=builder /app/server/dist ./dist
# Seed data files read at runtime by seed-course-content and seed-posttests.
# Placed in dist/seed-data/ so import.meta.url-relative paths resolve correctly.
COPY --from=builder /app/server/db/seed/seed-data ./dist/seed-data
# Full node_modules required for externalized native modules (pdfkit, @napi-rs/canvas, etc.)
COPY --from=deps /app/node_modules ./node_modules
# Handlebars email templates (externalized from bundle)
COPY --from=builder /app/server/mail ./mail
# Certificate template image used by the canvas renderer
COPY --from=builder /app/server/assets ./assets
# AI analytics `ai` schema, applied at boot when missing or changed
COPY --from=builder /app/server/db/aiViews/001_ai_schema.sql ./db/aiViews/001_ai_schema.sql
# Drizzle migration files for startup migrator
COPY --from=builder /app/server/db/migrations ./db/migrations
# Migration runner script
COPY --from=builder /app/server/scripts/migrate.mjs ./scripts/migrate.mjs
# Operator service account bootstrap (docs/operator-access.md):
#   node scripts/create-operator-user.mjs --email <address> [--apply]
COPY --from=builder /app/server/scripts/create-operator-user.mjs ./scripts/create-operator-user.mjs
# CRM outbox health, read-only: node scripts/crm-outbox-status.mjs
COPY --from=builder /app/server/scripts/crm-outbox-status.mjs ./scripts/crm-outbox-status.mjs
# Entrypoint: gives the uploads volume to "node", drops to it, runs migrations
# then starts the server. The app code stays root-owned (read-only to the app);
# only /app/uploads is writable by it.
COPY server/entrypoint.sh ./entrypoint.sh
RUN chmod 0755 ./entrypoint.sh && mkdir -p ./uploads/certificates ./uploads/media && chown -R node:node ./uploads
EXPOSE 5000
ENTRYPOINT ["./entrypoint.sh"]
