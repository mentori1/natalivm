import { spawn } from "node:child_process";
import { resolve } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });
dotenv.config({ path: ".env.bot.local", override: true });

const child = spawn(
  process.execPath,
  [resolve("node_modules/next/dist/bin/next"), "dev", "-p", "3002"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: "file:./dance-crm-test.db",
      LOCAL_AUTH_BYPASS: "1",
    },
  },
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
