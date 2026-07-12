import type { SearchResult } from "./database.js";

const escapeHtml = (value: string): string => value
  .replace(/&/gu, "&amp;")
  .replace(/</gu, "&lt;")
  .replace(/>/gu, "&gt;")
  .replace(/"/gu, "&quot;");

export const formatFindResult = (result: SearchResult, index: number): string =>
  `${index}. ${escapeHtml(result.messagePreview || "Фото")} — <a href="${escapeHtml(result.messageUrl)}">відкрити</a>`;
