import { Effect } from "effect";
import { carCommandPlate } from "./car-command";
import type { IndexStore } from "./indexing";
import { messageLink } from "./message-link";
import { carMessagePreview } from "./message-preview";
import type { MediaType } from "./media-label";

export interface CarMessage {
  readonly chatId: number;
  readonly messageId: number;
  readonly chatUsername?: string;
  readonly text: string;
  readonly mediaType?: MediaType;
  readonly mediaGroupId?: string;
}

export const indexCarMessage = (store: IndexStore, message: CarMessage): Effect.Effect<void> => {
  const plate = carCommandPlate(message.text);
  if (!plate) return Effect.void;

  return store.save({
    plate,
    chatId: message.chatId,
    messagePreview: carMessagePreview(message.text, message.mediaType !== undefined),
    ...(message.mediaType ? { mediaType: message.mediaType } : {}),
    ...(message.mediaGroupId ? { mediaGroupId: message.mediaGroupId } : {}),
    messageUrl: messageLink({
      chatId: message.chatId,
      messageId: message.messageId,
      username: message.chatUsername,
    }),
  });
};
