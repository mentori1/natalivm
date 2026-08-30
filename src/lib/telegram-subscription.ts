import { getBotSettings } from "@/lib/bot-settings";
import {
  telegramAdminIds,
  telegramApi,
  type TelegramChatMember,
} from "@/lib/telegram-api";

type RequiredChannelSettings = Awaited<ReturnType<typeof getBotSettings>>;

export function subscriptionChannelUrl(
  chatId: string | null,
  configuredUrl: string | null,
) {
  if (configuredUrl) return configuredUrl;
  if (chatId?.startsWith("@")) return `https://t.me/${chatId.slice(1)}`;
  return null;
}

export async function requiredSubscriptionAccess(
  userId: string,
  configuredSettings?: RequiredChannelSettings,
) {
  const settings = configuredSettings ?? await getBotSettings();
  const subscribeUrl = subscriptionChannelUrl(
    settings.requiredChannelChatId,
    settings.requiredChannelUrl,
  );
  if (
    telegramAdminIds().has(userId) ||
    !settings.requiredChannelChatId
  ) {
    return { subscribed: true, subscribeUrl };
  }

  try {
    const member = await telegramApi<TelegramChatMember>("getChatMember", {
      chat_id: settings.requiredChannelChatId,
      user_id: Number(userId),
    });
    const subscribed = member.status === "restricted"
      ? member.is_member !== false
      : !["left", "kicked"].includes(member.status);
    return { subscribed, subscribeUrl };
  } catch {
    return { subscribed: false, subscribeUrl };
  }
}

export async function hasRequiredSubscription(userId: string) {
  return (await requiredSubscriptionAccess(userId)).subscribed;
}

export async function setClientCabinetMenu(
  chatId: string,
  allowed: boolean,
) {
  const miniAppUrl = process.env.MINIAPP_URL?.trim();
  await telegramApi<boolean>("setChatMenuButton", {
    chat_id: chatId,
    menu_button: allowed && miniAppUrl
      ? {
          type: "web_app",
          text: "Личный кабинет",
          web_app: { url: miniAppUrl },
        }
      : { type: "commands" },
  });
}
