#!/bin/sh
# Starts the local Sites edition inside Docker:
#   1. keeps a per-computer Administrator setup secret in the data volume (created once),
#   2. writes the local Worker settings (.dev.vars) from it and the compose environment,
#   3. applies any new database migrations to the local D1 database,
#   4. starts the dev server on port 3000.
# Local development only: email runs in test mode (nothing is sent; invitation links appear on screen).
set -eu
cd /app

DATA=/app/.wrangler
STATE="$DATA/state"
SECRET_FILE="$DATA/setup-secret"
mkdir -p "$STATE"

if [ ! -s "$SECRET_FILE" ]; then
  umask 077
  node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))" > "$SECRET_FILE"
  echo "Created this computer's Administrator setup secret. Show it with:"
  echo "  docker compose exec app cat /app/.wrangler/setup-secret"
fi

umask 077
{
  echo "# Written by docker/entrypoint.sh at every start. Local development only."
  echo "ADMIN_SETUP_TOKEN=$(cat "$SECRET_FILE")"
  echo "MAIL_PROVIDER=test"
  echo "MAIL_ALLOWED_RECIPIENTS=${MAIL_ALLOWED_RECIPIENTS:-*}"
  echo "APP_ORIGIN=${APP_ORIGIN:-http://localhost:3000}"
  # Optional: notifications in test mail mode (nothing leaves the computer), e.g. NOTIFY_STAFF=assignment,review,returned
  [ -n "${NOTIFY_STAFF:-}" ] && echo "NOTIFY_STAFF=$NOTIFY_STAFF"
  [ -n "${NOTIFY_CLIENT:-}" ] && echo "NOTIFY_CLIENT=$NOTIFY_CLIENT"
  true
} > /app/.dev.vars

echo "Applying database migrations to the local D1 database..."
CI=true npx wrangler d1 migrations apply DB --local \
  --config docker/wrangler.local.jsonc --persist-to "$STATE"

echo "Starting Workflow VAPS on ${APP_ORIGIN:-http://localhost:3000}"
exec npm run dev -- --hostname 0.0.0.0 --port 3000
