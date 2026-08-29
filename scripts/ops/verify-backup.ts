import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

type Row = Record<string, unknown>;
type Backup = {
  counts: Record<string, number>;
  total: number;
  tables: Record<string, Row[]>;
};

const requiredTables = [
  "client",
  "singleVisit",
  "subscription",
  "priceItem",
  "subscriptionVisit",
  "lesson",
  "attendance",
  "note",
  "clientGoal",
  "expense",
  "telegramBusinessConnection",
  "telegramConversation",
  "botTask",
  "telegramUpdate",
  "botSettings",
  "botSession",
  "botContent",
  "botChannel",
  "botBooking",
];

const primaryKey: Record<string, string> = {
  botSession: "telegramChatId",
  botContent: "key",
  botChannel: "telegramChatId",
};

function ids(rows: Row[], field = "id") {
  return new Set(rows.map((row) => String(row[field])));
}

function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Укажите путь к JSON-бэкапу");

  const path = resolve(file);
  const raw = readFileSync(path, "utf8");
  const backup = JSON.parse(raw) as Backup;
  const failures: string[] = [];

  for (const table of requiredTables) {
    const rows = backup.tables?.[table];
    if (!Array.isArray(rows)) {
      failures.push(`нет таблицы ${table}`);
      continue;
    }
    const key = primaryKey[table] || "id";
    if (ids(rows, key).size !== rows.length) {
      failures.push(`повторяются ${key} в ${table}`);
    }
    if (backup.counts?.[table] !== rows.length) {
      failures.push(`не совпадает count для ${table}`);
    }
  }

  const clients = ids(backup.tables.client ?? []);
  const lessons = ids(backup.tables.lesson ?? []);
  const subscriptions = ids(backup.tables.subscription ?? []);
  const hasRef = (row: Row, field: string, values: Set<string>) =>
    values.has(String(row[field]));

  if (
    !(backup.tables.subscription ?? []).every((row) =>
      hasRef(row, "clientId", clients),
    )
  ) {
    failures.push("абонемент без клиента");
  }
  if (
    !(backup.tables.singleVisit ?? []).every((row) =>
      hasRef(row, "clientId", clients),
    )
  ) {
    failures.push("разовое посещение без клиента");
  }
  if (
    !(backup.tables.attendance ?? []).every(
      (row) =>
        hasRef(row, "clientId", clients) && hasRef(row, "lessonId", lessons),
    )
  ) {
    failures.push("посещение без клиента или занятия");
  }
  if (
    !(backup.tables.subscriptionVisit ?? []).every((row) =>
      hasRef(row, "subscriptionId", subscriptions),
    )
  ) {
    failures.push("история без абонемента");
  }

  const calculatedTotal = requiredTables.reduce(
    (sum, table) => sum + (backup.tables[table]?.length ?? 0),
    0,
  );
  if (calculatedTotal !== backup.total) failures.push("не совпадает общий итог");

  const sha256 = createHash("sha256").update(raw).digest("hex");
  console.log(
    JSON.stringify({
      file: basename(path),
      tables: requiredTables.length,
      total: calculatedTotal,
      sha256,
      valid: failures.length === 0,
      failures,
    }),
  );
  if (failures.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
