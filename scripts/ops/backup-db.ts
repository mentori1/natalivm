import "dotenv/config";

import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { prisma } from "../../src/lib/db";

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

async function main() {
  const destination = resolve(process.argv[2] ?? "backups");
  mkdirSync(destination, { recursive: true, mode: 0o700 });

  // Запросы выполняются последовательно из-за лимита соединений Supabase.
  const tables = {
    client: await prisma.client.findMany(),
    singleVisit: await prisma.singleVisit.findMany(),
    subscription: await prisma.subscription.findMany(),
    priceItem: await prisma.priceItem.findMany(),
    subscriptionVisit: await prisma.subscriptionVisit.findMany(),
    lesson: await prisma.lesson.findMany(),
    attendance: await prisma.attendance.findMany(),
    note: await prisma.note.findMany(),
    clientGoal: await prisma.clientGoal.findMany(),
    expense: await prisma.expense.findMany(),
    telegramBusinessConnection:
      await prisma.telegramBusinessConnection.findMany(),
    telegramConversation: await prisma.telegramConversation.findMany(),
    botTask: await prisma.botTask.findMany(),
    telegramUpdate: await prisma.telegramUpdate.findMany(),
    botSettings: await prisma.botSettings.findMany(),
    botSession: await prisma.botSession.findMany(),
    botContent: await prisma.botContent.findMany(),
    botChannel: await prisma.botChannel.findMany(),
    botBooking: await prisma.botBooking.findMany(),
  };
  const counts = Object.fromEntries(
    Object.entries(tables).map(([name, rows]) => [name, rows.length]),
  );
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const payload = {
    createdAt: new Date().toISOString(),
    source: "Supabase production",
    release: process.env.APP_RELEASE ?? null,
    counts,
    total,
    tables,
  };
  const json = JSON.stringify(
    payload,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );
  const filename = `dance-crm-supabase-${timestamp()}.json`;
  const output = join(destination, filename);
  const temporary = join(dirname(output), `.${basename(output)}.tmp`);

  writeFileSync(temporary, json, { mode: 0o600 });
  renameSync(temporary, output);
  chmodSync(output, 0o600);

  const digest = createHash("sha256").update(json).digest("hex");
  writeFileSync(`${output}.sha256`, `${digest}  ${filename}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ output, counts, total, sha256: digest }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
