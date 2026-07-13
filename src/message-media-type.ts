import type { MediaType } from "./media-label.js";

type CaptionableMessage = {
  readonly photo?: unknown;
  readonly video?: unknown;
  readonly animation?: unknown;
  readonly document?: { readonly mime_type?: string };
};

export const mediaTypeFromMessage = (message: CaptionableMessage): MediaType | undefined => {
  if (message.photo) return "photo";
  if (message.video || message.animation) return "video";
  if (message.document?.mime_type?.startsWith("video/")) return "video";
  return undefined;
};
