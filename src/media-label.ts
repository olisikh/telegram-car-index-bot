export type MediaType = "photo" | "video";

export const mediaLabel = (mediaTypes?: string): string | undefined => {
  const types = new Set(mediaTypes?.split(",") ?? []);
  if (types.has("photo") && types.has("video")) return "Фото і Відео";
  if (types.has("photo")) return "Фото";
  if (types.has("video")) return "Відео";
  return undefined;
};
