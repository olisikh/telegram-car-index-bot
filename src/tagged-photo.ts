import { Effect } from "effect";
import type { IndexStore } from "./indexing.js";
import { messageLink } from "./message-link.js";
import { normalizePlate } from "./plates.js";

const LEADING_PLATE_TAG = /^#\s*([A-ZА-ЯІЇЄҐ]{2}\s*\d{4}\s*[A-ZА-ЯІЇЄҐ]{2})/iu;

export interface TaggedPhotoReply {
  readonly chatId: number;
  readonly photoMessageId: number;
  readonly chatUsername?: string;
  readonly text: string;
}

export const indexTaggedPhotoReply = (
  store: IndexStore,
  reply: TaggedPhotoReply,
): Effect.Effect<void> => {
  const plate = normalizePlate(reply.text.match(LEADING_PLATE_TAG)?.[1] ?? "");
  if (!plate) return Effect.void;

  return store.save({
    plate,
    messageUrl: messageLink({
      chatId: reply.chatId,
      messageId: reply.photoMessageId,
      username: reply.chatUsername,
    }),
  });
};
