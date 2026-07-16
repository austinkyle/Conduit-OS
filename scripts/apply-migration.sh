#!/usr/bin/env bash
# Applies conduit-cfo/db/migrations/009_integration.sql to an already-running stack whose
# Postgres volume predates this migration. `docker-entrypoint-initdb.d` only runs on first
# volume init, so a fresh `docker compose up` on an existing `pgdata` volume never picks up new
# migration files — this script is the documented alternative to `docker compose down -v`
# (which would also wipe demo/seed data) for volume-keepers.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

MIGRATION="conduit-cfo/db/migrations/009_integration.sql"

if ! docker compose exec -T postgres psql -U conduit -d conduit < "$MIGRATION"; then
  echo "Failed to apply $MIGRATION" >&2
  exit 1
fi

echo "Applied $MIGRATION"
