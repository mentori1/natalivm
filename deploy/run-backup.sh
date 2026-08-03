#!/usr/bin/env bash
set -euo pipefail
umask 077

backup_dir="${1:-/srv/natalivm/backups/database}"
mkdir -p "$backup_dir"

output="$(npm run --silent db:backup -- "$backup_dir")"
backup_file="$(node -e 'const result=JSON.parse(process.argv[1]); process.stdout.write(result.output)' "$output")"
npm run --silent db:verify-backup -- "$backup_file"

# Ежедневные копии храним 35 дней. Контрольные суммы удаляются вместе с ними.
find "$backup_dir" -type f \( -name 'dance-crm-supabase-*.json' -o -name 'dance-crm-supabase-*.json.sha256' \) -mtime +35 -delete
