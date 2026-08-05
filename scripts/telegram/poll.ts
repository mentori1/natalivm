import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.bot.local", override: true });

async function main() {
  const {
    handleTelegramUpdate,
    runScheduledTelegramJobs,
    syncTelegramBotProfile,
    telegramApi,
  } =
    await import("../../src/lib/telegram-bot");
  type Update = Parameters<typeof handleTelegramUpdate>[0];

  const me = await telegramApi<{ username?: string }>("getMe");
  await syncTelegramBotProfile().catch((error) => {
    console.error(
      `Не удалось обновить профиль бота: ${error instanceof Error ? error.message : error}`,
    );
  });
  if (process.env.TELEGRAM_LOCAL_POLLING === "1") {
    // В production сохраняем события, пришедшие во время переключения webhook -> polling.
    // Очистка очереди разрешена только явной переменной для изолированного теста.
    await telegramApi<boolean>("deleteWebhook", {
      drop_pending_updates:
        process.env.TELEGRAM_DROP_PENDING_UPDATES === "1",
    });
    await telegramApi<boolean>("setMyCommands", {
      commands: [
        { command: "start", description: "Открыть главное меню" },
        { command: "menu", description: "Показать меню" },
      ],
    });
  }
  console.log(`Бот @${me.username ?? "unknown"} запущен. Остановить: Ctrl+C`);

  let offset = 0;
  let lastJobsRun = 0;

  while (true) {
    try {
      const updates = await telegramApi<Update[]>("getUpdates", {
        offset,
        timeout: 25,
        allowed_updates: [
          "message",
          "channel_post",
          "business_connection",
          "business_message",
          "edited_business_message",
          "deleted_business_messages",
          "callback_query",
        ],
      });
      for (const update of updates) {
        await handleTelegramUpdate(update);
        offset = Math.max(offset, update.update_id + 1);
      }
      if (Date.now() - lastJobsRun > 60_000) {
        await runScheduledTelegramJobs();
        lastJobsRun = Date.now();
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
