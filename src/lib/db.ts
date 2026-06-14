import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7: подключение к БД идёт через driver adapter.
// PostgreSQL (Supabase) — строка подключения в .env (DATABASE_URL).
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Один экземпляр клиента на процесс (иначе в dev при hot-reload плодятся коннекты).
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
