const elapsed = (milliseconds: number): string => `${(milliseconds / 1_000).toFixed(1)} с`;

const photo = (messageUrl: string): string => `<a href="${messageUrl}">Фото</a>`;

export const recognitionSuccessFeedback = (
  messageUrl: string,
  plates: ReadonlyArray<string>,
  elapsedMs: number,
): string => `✅ ${photo(messageUrl)} — ДНЗ: ${plates.map((plate) => `<code>${plate}</code>`).join(", ")}\n⏱ ${elapsed(elapsedMs)}`;

export const recognitionNoPlateFeedback = (messageUrl: string, elapsedMs: number): string =>
  `⚠️ ${photo(messageUrl)} — ДНЗ не розпізнано.\n⏱ ${elapsed(elapsedMs)}`;

export const recognitionTimeoutFeedback = (messageUrl: string, elapsedMs: number): string =>
  `⌛ ${photo(messageUrl)} — час аналізу вичерпано.\n⏱ ${elapsed(elapsedMs)}`;

export const recognitionCrashFeedback = (messageUrl: string, elapsedMs: number): string =>
  `❌ ${photo(messageUrl)} — помилка аналізу.\n⏱ ${elapsed(elapsedMs)}`;
