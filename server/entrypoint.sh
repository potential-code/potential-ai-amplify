#!/bin/sh
set -e

# The container starts as root only for this step: the uploads volume may hold
# files written by older images, which ran as root. Hand anything not already
# owned by the app user to it (-h: change a symlink itself, never its target),
# then re-run this script as that user. Nothing else runs as root.
APP_USER=node
UPLOADS_DIR=/app/uploads
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$UPLOADS_DIR/certificates" "$UPLOADS_DIR/media"
  find "$UPLOADS_DIR" \( ! -user "$APP_USER" -o ! -group "$APP_USER" \) -exec chown -h "$APP_USER:$APP_USER" {} +
  exec su-exec "$APP_USER" "$0" "$@"
fi

echo "Running database migrations..."
node ./scripts/migrate.mjs

echo "Starting server..."
exec node --enable-source-maps ./dist/index.mjs
