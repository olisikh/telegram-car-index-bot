import type { SearchResult } from "./database.js";
import { mediaLabel } from "./media-label.js";

const escapeHtml = (value: string): string => value
  .replace(/&/gu, "&amp;")
  .replace(/</gu, "&lt;")
  .replace(/>/gu, "&gt;")
  .replace(/"/gu, "&quot;");

export const formatFindResult = (result: SearchResult, index: number): string => {
  const preview = result.messagePreview === "Мультимедіа"
    ? mediaLabel(result.mediaTypes) ?? result.messagePreview
    : result.messagePreview || "Мультимедіа";
  return `${index}. <a href="${escapeHtml(result.messageUrl)}">лінк</a> — ${escapeHtml(preview)}`;
};
