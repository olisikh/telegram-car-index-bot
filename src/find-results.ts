import type { SearchResult } from "./database.js";
import { messages, type Locale } from "./i18n.js";

const escapeHtml = (value: string): string => value
  .replace(/&/gu, "&amp;")
  .replace(/</gu, "&lt;")
  .replace(/>/gu, "&gt;")
  .replace(/"/gu, "&quot;");

const photoDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Kyiv",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const photoPostedAt = (createdAt: string): string => {
  const date = new Date(`${createdAt.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return createdAt;
  const parts = Object.fromEntries(photoDateFormatter.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}`;
};

export const formatFindResult = (locale: Locale, result: SearchResult, index: number): string =>
  `${index}. ${escapeHtml(result.plate)} · <a href="${escapeHtml(result.messageUrl)}">${messages(locale).link}</a> — ${photoPostedAt(result.createdAt)}`;
