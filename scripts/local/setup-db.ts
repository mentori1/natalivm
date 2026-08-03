import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const localDir = resolve(root, "prisma/.local");
const localSchema = resolve(localDir, "schema.prisma");
const databasePath = resolve(root, "dance-crm-test.db");
const databaseAlreadyExists = existsSync(databasePath);
// Относительный file: URL обходится без проблем нативного SQLite-движка
// с кириллицей в полном пути к рабочей папке.
const databaseUrl = "file:./dance-crm-test.db";

mkdirSync(localDir, { recursive: true });

const source = readFileSync(resolve(root, "prisma/schema.prisma"), "utf8")
  .replace('provider = "postgresql"', 'provider = "sqlite"')
  .replace(
    'output   = "../src/generated/prisma"',
    'output   = "../../src/generated/prisma"',
  );
writeFileSync(localSchema, source);

const env = { ...process.env, DATABASE_URL: databaseUrl };
execFileSync(
  process.execPath,
  [resolve(root, "node_modules/prisma/build/index.js"), "generate", "--schema", localSchema],
  { stdio: "inherit", env },
);
execFileSync(
  process.execPath,
  [resolve(root, "node_modules/prisma/build/index.js"), "db", "push", "--schema", localSchema],
  { stdio: "inherit", env },
);
if (process.env.LOCAL_KEEP_DATA !== "1" || !databaseAlreadyExists) {
  execFileSync(
    resolve(root, "node_modules/.bin/tsx"),
    [resolve(root, "prisma/seed.ts")],
    { stdio: "inherit", env },
  );
} else {
  console.log("Локальные данные сохранены, выполнено только обновление схемы.");
}

console.log(`Локальная тестовая база готова: ${databasePath}`);
