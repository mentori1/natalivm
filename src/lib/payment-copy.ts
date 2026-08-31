export const CHANNEL_RECOMMENDATION =
  "\n\nРекомендуем подписаться на канал @VUMEXCLUSIVE, чтобы получать новости, полезные материалы и анонсы занятий.";

export const OFFLINE_INDIVIDUAL_PAYMENT_POLICY =
  "Офлайн-персональная тренировка проводится по предварительной оплате. После подтверждения оплаты Наталья бронирует время и оплачивает зал. Отменить или перенести без списания можно не позднее чем за 12 часов до начала. Если до занятия осталось меньше 12 часов, занятие списывается, оплата не возвращается.";

export function withChannelRecommendation(message: string) {
  return `${message}${CHANNEL_RECOMMENDATION}`;
}

export function withOfflineIndividualPolicy(
  message: string,
  type: string,
  format: string,
) {
  return type === "offline" && format === "individual"
    ? `${message}\n\n${OFFLINE_INDIVIDUAL_PAYMENT_POLICY}`
    : message;
}
