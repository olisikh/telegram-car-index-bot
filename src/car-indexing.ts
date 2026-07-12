import { Effect } from "effect";
import { carCommandPlate } from "./car-command.js";
import type { IndexStore } from "./indexing.js";
import { messageLink } from "./message-link.js";
import { carMessagePreview } from "./message-preview.js";

export interface CarMessage {
  readonly chatId: number;
  readonly messageId: number;
  readonly chatUsername?: string;
  readonly text: string;
  readonly hasMedia: boolean;
}

export const indexCarMessage = (store: IndexStore, message: CarMessage): Effect.Effect<void> => {
  const plate = carCommandPlate(message.text);
  if (!plate) return Effect.void;

  return store.save({
    plate,
    chatId: message.chatId,
    messagePreview: carMessagePreview(message.text, message.hasMedia),
    messageUrl: messageLink({
      chatId: message.chatId,
      messageId: message.messageId,
      username: message.chatUsername,
    }),
  });
};
