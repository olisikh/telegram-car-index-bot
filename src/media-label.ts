import { messages, type Locale } from "./i18n";

export type MediaType = "photo" | "video";

export const mediaLabel = (locale: Locale, mediaTypes?: string): string | undefined => {
  const text = messages(locale);
  const types = new Set(mediaTypes?.split(",") ?? []);
  if (types.has("photo") && types.has("video")) return text.photoAndVideo;
  if (types.has("photo")) return text.photo;
  if (types.has("video")) return text.video;
  return undefined;
};
