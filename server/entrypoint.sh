#!/bin/sh
set -e

echo "Running database migrations..."
node ./scripts/migrate.mjs

echo "Running database seed (no-op if already seeded)..."
node ./dist/seed.mjs

echo "Starting server..."
exec node --enable-source-maps ./dist/index.mjs
