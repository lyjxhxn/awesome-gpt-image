#!/usr/bin/env sh
set -eu

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
POSTGRES_PASSWORD=$(sed -n 's/^POSTGRES_PASSWORD=//p' "$root_dir/deploy/core/.env")
if [ -z "$POSTGRES_PASSWORD" ]; then
  echo "POSTGRES_PASSWORD is missing" >&2
  exit 1
fi

docker exec -i awesome-gpt-image-supabase-db-1 \
  psql -v ON_ERROR_STOP=1 -v db_password="$POSTGRES_PASSWORD" -U supabase_admin -d postgres <<'SQL'
alter role supabase_auth_admin with login password :'db_password';
alter role authenticator with login password :'db_password';
SQL

echo "Updated internal database role credentials."
