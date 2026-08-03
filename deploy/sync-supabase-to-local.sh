#!/usr/bin/env bash
set -euo pipefail
umask 077

activate=false
if [[ "${1:-}" == "--activate" ]]; then
  activate=true
elif [[ $# -gt 0 ]]; then
  echo "Использование: $0 [--activate]" >&2
  exit 2
fi

app_dir="/srv/natalivm/current"
source_env="/etc/natalivm/supabase.env"
local_env="/etc/natalivm/database.env"
backup_dir="/var/backups/natalivm/migrations"
pg_bin="/usr/lib/postgresql/17/bin"
database="natalivm_crm"
import_database="${database}_import"
app_role="natalivm_app"

tables=(
  Client SingleVisit Subscription PriceItem SubscriptionVisit Lesson Attendance
  Note ClientGoal Expense TelegramBusinessConnection TelegramConversation BotTask
  TelegramUpdate BotSettings BotSession BotContent BotChannel BotBooking
)

for path in "$source_env" "$local_env"; do
  if [[ ! -r "$path" ]]; then
    echo "Нет файла настроек: $path" >&2
    exit 1
  fi
done

source_url="$(cd "$app_dir" && node - "$source_env" <<'NODE'
const dotenv = require("dotenv");
dotenv.config({ path: process.argv[2], quiet: true });
const url = new URL(process.env.DATABASE_URL);
for (const key of ["pgbouncer", "connection_limit", "pool_timeout"]) url.searchParams.delete(key);
process.stdout.write(url.toString());
NODE
)"
import_url="$(cd "$app_dir" && node - "$local_env" "$import_database" <<'NODE'
const dotenv = require("dotenv");
dotenv.config({ path: process.argv[2], quiet: true });
const url = new URL(process.env.DATABASE_URL);
url.pathname = `/${process.argv[3]}`;
process.stdout.write(url.toString());
NODE
)"

mkdir -p "$backup_dir"
chown root:postgres "$backup_dir"
chmod 750 "$backup_dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump="$backup_dir/supabase-${stamp}.dump"
temporary="$backup_dir/.supabase-${stamp}.dump.tmp"

PGCONNECT_TIMEOUT=20 "$pg_bin/pg_dump" \
  --dbname="$source_url" \
  --schema=public \
  --format=custom \
  --compress=6 \
  --no-owner \
  --no-privileges \
  --file="$temporary"
chmod 600 "$temporary"
"$pg_bin/pg_restore" --list "$temporary" >/dev/null
mv "$temporary" "$dump"
chown root:postgres "$dump"
chmod 640 "$dump"
sha256sum "$dump" | sed "s#  $dump#  $(basename "$dump")#" > "$dump.sha256"
chmod 600 "$dump.sha256"

runuser -u postgres -- "$pg_bin/dropdb" --if-exists --force "$import_database" >/dev/null
runuser -u postgres -- "$pg_bin/createdb" --owner="$app_role" "$import_database"
runuser -u postgres -- "$pg_bin/psql" -X -v ON_ERROR_STOP=1 -d "$import_database" \
  -c "DROP SCHEMA public CASCADE" >/dev/null
"$pg_bin/pg_restore" \
  --exit-on-error \
  --no-owner \
  --no-privileges \
  --dbname="$import_url" \
  "$dump"

# Сравниваем не только количество, но и содержимое каждой строки.
total=0
for table in "${tables[@]}"; do
  sql="SET TIME ZONE 'UTC'; SELECT count(*)::text || ':' || md5(COALESCE(string_agg(to_jsonb(t)::text, '' ORDER BY to_jsonb(t)::text), '')) FROM \"$table\" t"
  source_fingerprint="$(PGCONNECT_TIMEOUT=20 "$pg_bin/psql" -X -A -t "$source_url" -c "$sql")"
  local_fingerprint="$(runuser -u postgres -- "$pg_bin/psql" -X -A -t -d "$import_database" -c "$sql")"
  if [[ "$source_fingerprint" != "$local_fingerprint" ]]; then
    echo "Не совпадают данные таблицы $table" >&2
    exit 1
  fi
  count="${source_fingerprint%%:*}"
  total=$((total + count))
done

sequence_sql="SELECT md5(COALESCE(string_agg(sequencename || ':' || COALESCE(last_value::text, 'null'), ',' ORDER BY sequencename), '')) FROM pg_sequences WHERE schemaname='public'"
source_sequences="$(PGCONNECT_TIMEOUT=20 "$pg_bin/psql" -X -A -t "$source_url" -c "$sequence_sql")"
local_sequences="$(runuser -u postgres -- "$pg_bin/psql" -X -A -t -d "$import_database" -c "$sequence_sql")"
if [[ "$source_sequences" != "$local_sequences" ]]; then
  echo "Не совпадает состояние последовательностей ID" >&2
  exit 1
fi

if [[ "$activate" == true ]]; then
  systemctl stop natalivm-crm.service
  systemctl stop natalivm-bot.service >/dev/null 2>&1 || true
  runuser -u postgres -- "$pg_bin/psql" -X -v ON_ERROR_STOP=1 -d postgres \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('$database', '$import_database') AND pid <> pg_backend_pid()" >/dev/null

  if runuser -u postgres -- "$pg_bin/psql" -X -A -t -d postgres -c "SELECT 1 FROM pg_database WHERE datname='$database'" | grep -q 1; then
    previous_database="${database}_before_${stamp//[^0-9A-Za-z_]/_}"
    runuser -u postgres -- "$pg_bin/psql" -X -v ON_ERROR_STOP=1 -d postgres \
      -c "ALTER DATABASE \"$database\" RENAME TO \"$previous_database\"" >/dev/null
  fi
  runuser -u postgres -- "$pg_bin/psql" -X -v ON_ERROR_STOP=1 -d postgres \
    -c "ALTER DATABASE \"$import_database\" RENAME TO \"$database\"" >/dev/null

  rm -f "$app_dir/.env"
  ln -s "$local_env" "$app_dir/.env"
  systemctl start natalivm-crm.service
  for _ in {1..20}; do
    if curl -fsS http://127.0.0.1:3000/login >/dev/null 2>&1; then break; fi
    sleep 1
  done
  systemctl is-active --quiet natalivm-crm.service
  curl -fsS http://127.0.0.1:3000/login >/dev/null
fi

printf '{"dump":"%s","tables":%d,"total":%d,"matched":true,"activated":%s}\n' \
  "$dump" "${#tables[@]}" "$total" "$activate"
