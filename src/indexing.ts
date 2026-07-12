import { Effect } from "effect";
import { messageLink } from "./message-link.js";
import { carMessagePreview } from "./message-preview.js";
import { extractPlates } from "./plates.js";

export interface IndexRecord {
  readonly plate: string;
  readonly chatId: number;
  readonly messageUrl: string;
  readonly messagePreview: string;
}

export interface IndexStore {
  readonly save: (record: IndexRecord) => Effect.Effect<void>;
}

export interface PhotoMessage {
  readonly chatId: number;
  readonly messageId: number;
  readonly chatUsername?: string;
  readonly caption: string;
}

export const indexPhotoMessage = (store: IndexStore, message: PhotoMessage): Effect.Effect<void> =>
  Effect.forEach(extractPlates(message.caption), (plate) =>
    store.save({
      plate,
      chatId: message.chatId,
      messagePreview: carMessagePreview(message.caption, true),
      messageUrl: messageLink({
        chatId: message.chatId,
        messageId: message.messageId,
        username: message.chatUsername,
      }),
    }),
  ).pipe(Effect.asVoid);
