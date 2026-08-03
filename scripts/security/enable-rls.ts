import "dotenv/config";
import { Client } from "pg";

const tables = [
  "Client",
  "SingleVisit",
  "Subscription",
  "PriceItem",
  "SubscriptionVisit",
  "Lesson",
  "Attendance",
  "Note",
  "ClientGoal",
  "Expense",
  "TelegramBusinessConnection",
  "TelegramConversation",
  "BotTask",
  "TelegramUpdate",
  "BotSettings",
  "BotSession",
  "BotContent",
  "BotChannel",
  "BotBooking",
];

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  const db = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await db.connect();

  try {
    console.log("Before:");
    await printState(db);

    for (const table of tables) {
      await db.query(`ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY`);
    }

    console.log("\nAfter:");
    await printState(db);
  } finally {
    await db.end();
  }
}

async function printState(db: Client) {
  const result = await db.query<{
    table_name: string;
    rls_enabled: boolean;
    rls_forced: boolean;
  }>(
    `
      select
        c.relname as table_name,
        c.relrowsecurity as rls_enabled,
        c.relforcerowsecurity as rls_forced
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and c.relname = any($1::text[])
      order by c.relname;
    `,
    [tables],
  );

  for (const row of result.rows) {
    console.log(
      `${row.table_name}: RLS ${row.rls_enabled ? "enabled" : "disabled"}${
        row.rls_forced ? ", forced" : ""
      }`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
