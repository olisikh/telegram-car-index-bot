import { Effect } from "effect";
import type { IndexStore } from "./indexing.js";
import type { MediaType } from "./media-label.js";
import { messageLink } from "./message-link.js";
import { normalizePlate } from "./plates.js";

const LEADING_PLATE_TAG = /^#\s*([A-ZА-ЯІЇЄҐ]{2}\s*\d{4}\s*[A-ZА-ЯІЇЄҐ]{2})/iu;

export interface TaggedMediaReply {
  readonly chatId: number;
  readonly mediaMessageId: number;
  readonly chatUsername?: string;
  readonly text: string;
  readonly mediaType: MediaType;
  readonly mediaGroupId?: string;
}

export const indexTaggedMediaReply = (
  store: IndexStore,
  reply: TaggedMediaReply,
): Effect.Effect<void> => {
  const plate = normalizePlate(reply.text.match(LEADING_PLATE_TAG)?.[1] ?? "");
  if (!plate) return Effect.void;

  return store.save({
    plate,
    chatId: reply.chatId,
    messagePreview: "Мультимедіа",
    mediaType: reply.mediaType,
    ...(reply.mediaGroupId ? { mediaGroupId: reply.mediaGroupId } : {}),
    messageUrl: messageLink({
      chatId: reply.chatId,
      messageId: reply.mediaMessageId,
      username: reply.chatUsername,
    }),
  });
};
