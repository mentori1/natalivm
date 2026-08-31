export const CHANNEL_RECOMMENDATION =
  "\n\nРекомендуем подписаться на канал @VUMEXCLUSIVE, чтобы получать новости, полезные материалы и анонсы занятий.";

export function withChannelRecommendation(message: string) {
  return `${message}${CHANNEL_RECOMMENDATION}`;
}
