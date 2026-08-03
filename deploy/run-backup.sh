#!/usr/bin/env bash
set -euo pipefail
umask 077

backup_dir="${1:-/srv/natalivm/backups/database}"
mkdir -p "$backup_dir"

output="$(npm run --silent db:backup -- "$backup_dir")"
backup_file="$(node -e 'const result=JSON.parse(process.argv[1]); process.stdout.write(result.output)' "$output")"
npm run --silent db:verify-backup -- "$backup_file"

if [[ -x /usr/lib/postgresql/17/bin/pg_dump ]] \
  && runuser -u postgres -- /usr/lib/postgresql/17/bin/psql -X -A -t -d postgres \
    -c "SELECT 1 FROM pg_database WHERE datname='natalivm_crm'" | grep -q 1; then
  "$(dirname "$0")/run-postgres-backup.sh" /var/backups/natalivm/postgres natalivm_crm
fi

# Ежедневные копии храним 35 дней. Контрольные суммы удаляются вместе с ними.
find "$backup_dir" -type f \( -name 'dance-crm-supabase-*.json' -o -name 'dance-crm-supabase-*.json.sha256' \) -mtime +35 -delete
