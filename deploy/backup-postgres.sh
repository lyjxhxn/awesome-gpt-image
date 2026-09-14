#!/usr/bin/env sh
set -eu

compose_dir=$(CDPATH= cd -- "$(dirname -- "$0")/core" && pwd)
backup_dir=${BACKUP_DIR:-/var/backups/awesome-gpt-image}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
umask 077
daily_dir="$backup_dir/daily"
weekly_dir="$backup_dir/weekly"
mkdir -p "$daily_dir" "$weekly_dir"

compose_files="-f $compose_dir/docker-compose.yml"
if [ -f "$compose_dir/docker-compose.server.yml" ]; then
  compose_files="$compose_files -f $compose_dir/docker-compose.server.yml"
fi

# shellcheck disable=SC2086
docker compose $compose_files --env-file "$compose_dir/.env" exec -T db \
  pg_dump -U postgres -d postgres --format=custom \
  > "$daily_dir/postgres-$timestamp.dump"

if [ "$(date -u +%u)" = "7" ]; then
  cp "$daily_dir/postgres-$timestamp.dump" "$weekly_dir/postgres-$timestamp.dump"
fi

find "$daily_dir" -type f -name 'postgres-*.dump' -mtime +7 -delete
find "$weekly_dir" -type f -name 'postgres-*.dump' -mtime +28 -delete
echo "Backup written to $daily_dir/postgres-$timestamp.dump"
