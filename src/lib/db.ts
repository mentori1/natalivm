import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// Prisma 7: подключение к БД идёт через driver adapter.
// PostgreSQL (Supabase) — строка подключения в .env (DATABASE_URL).
// max: 1 — на serverless каждый инстанс держит максимум 1 коннект,
// иначе Supabase Session pooler (лимит 15) быстро исчерпывается.
const databaseUrl = process.env.DATABASE_URL ?? "";
export const usesPostgres = !databaseUrl.startsWith("file:");
const adapter = usesPostgres
  ? new PrismaPg({
      connectionString: databaseUrl,
      max: 1,
      idleTimeoutMillis: 10_000,
    })
  : new PrismaBetterSqlite3({ url: databaseUrl });

// Один экземпляр клиента на процесс (иначе в dev при hot-reload плодятся коннекты).
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
