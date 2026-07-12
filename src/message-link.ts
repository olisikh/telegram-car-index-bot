export interface TelegramMessageRef {
  readonly chatId: number;
  readonly messageId: number;
  readonly username?: string;
}

export const messageLink = ({ chatId, messageId, username }: TelegramMessageRef): string => {
  if (username) return `https://t.me/${username}/${messageId}`;

  const id = String(chatId);
  if (!id.startsWith("-100")) {
    throw new Error("Direct links require a Telegram supergroup or channel");
  }

  return `https://t.me/c/${id.slice(4)}/${messageId}`;
};
