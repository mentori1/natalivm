#!/usr/bin/env bash
set -euo pipefail
umask 077

backup_dir="${1:-/srv/natalivm/backups/postgres}"
database="${2:-natalivm_crm}"
pg_bin="${PG_BIN:-/usr/lib/postgresql/17/bin}"
restore_database="${database}_restore_check"

tables=(
  Client SingleVisit Subscription PriceItem SubscriptionVisit Lesson Attendance
  Note ClientGoal Expense TelegramBusinessConnection TelegramConversation BotTask
  TelegramUpdate BotSettings BotSession BotContent BotChannel BotBooking
)

cleanup() {
  if [[ -n "${restore_database:-}" ]]; then
    runuser -u postgres -- "$pg_bin/dropdb" --if-exists --force "$restore_database" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

mkdir -p "$backup_dir"
chmod 700 "$backup_dir"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
filename="dance-crm-postgres-${stamp}.dump"
output="$backup_dir/$filename"
temporary="$backup_dir/.$filename.tmp"

runuser -u postgres -- "$pg_bin/pg_dump" \
  --format=custom \
  --compress=6 \
  --no-owner \
  --no-privileges \
  --dbname="$database" > "$temporary"
chmod 600 "$temporary"
"$pg_bin/pg_restore" --list "$temporary" >/dev/null
mv "$temporary" "$output"
sha256sum "$output" | sed "s#  $output#  $filename#" > "$output.sha256"
chmod 600 "$output.sha256"

# Полное пробное восстановление подтверждает, что архив реально пригоден для отката.
runuser -u postgres -- "$pg_bin/dropdb" --if-exists --force "$restore_database" >/dev/null
runuser -u postgres -- "$pg_bin/createdb" "$restore_database"
runuser -u postgres -- "$pg_bin/pg_restore" \
  --exit-on-error \
  --no-owner \
  --no-privileges \
  --dbname="$restore_database" \
  "$output"

total=0
for table in "${tables[@]}"; do
  original="$(runuser -u postgres -- "$pg_bin/psql" -X -A -t -d "$database" -c "SELECT count(*) FROM \"$table\"")"
  restored="$(runuser -u postgres -- "$pg_bin/psql" -X -A -t -d "$restore_database" -c "SELECT count(*) FROM \"$table\"")"
  if [[ "$original" != "$restored" ]]; then
    echo "Не совпадает число строк в $table: $original != $restored" >&2
    exit 1
  fi
  total=$((total + original))
done

runuser -u postgres -- "$pg_bin/dropdb" --force "$restore_database" >/dev/null
restore_database=""

find "$backup_dir" -type f \( -name 'dance-crm-postgres-*.dump' -o -name 'dance-crm-postgres-*.dump.sha256' \) -mtime +35 -delete
printf '{"output":"%s","tables":%d,"total":%d,"restored":true}\n' "$output" "${#tables[@]}" "$total"
