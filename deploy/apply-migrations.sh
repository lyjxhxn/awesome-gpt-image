#!/usr/bin/env sh
set -eu

compose_dir=$(CDPATH= cd -- "$(dirname -- "$0")/core" && pwd)
compose_files="-f $compose_dir/docker-compose.yml"
if [ -f "$compose_dir/docker-compose.server.yml" ]; then
  compose_files="$compose_files -f $compose_dir/docker-compose.server.yml"
fi
dc() {
  # shellcheck disable=SC2086
  docker compose $compose_files --env-file "$compose_dir/.env" "$@"
}

dc exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
create table if not exists public.schema_migrations (
  filename text primary key,
  applied_at timestamptz not null default now()
);
alter table public.schema_migrations enable row level security;
revoke all on table public.schema_migrations from public, anon, authenticated;
SQL

for migration in "$compose_dir"/../../supabase/migrations/*.sql; do
  name=$(basename "$migration")
  applied=$(dc exec -T db psql -U postgres -d postgres -Atc \
    "select 1 from public.schema_migrations where filename = '$name'")
  if [ "$applied" = "1" ]; then
    echo "Skipping $name"
    continue
  fi
  echo "Applying $name"
  {
    echo "begin;"
    cat "$migration"
    printf "\ninsert into public.schema_migrations (filename) values ('%s');\ncommit;\n" "$name"
  } | dc exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d postgres
done
