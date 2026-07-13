import type { RecognitionTimings } from "./recognition-timings.js";

const elapsed = (milliseconds: number): string => `${(milliseconds / 1_000).toFixed(1)} с`;
const stageElapsed = (milliseconds: number): string => milliseconds < 1_000 ? `${Math.round(milliseconds)} мс` : elapsed(milliseconds);

const photo = (messageUrl: string): string => `<a href="${messageUrl}">Фото</a>`;

const timingFeedback = (timings: RecognitionTimings | undefined): string => {
  if (!timings) return "";
  const lines = [
    timings.detectionMs === undefined ? undefined : `🕵️‍♂️ ${stageElapsed(timings.detectionMs)}`,
    timings.croppingMs === undefined ? undefined : `✂️ ${stageElapsed(timings.croppingMs)}`,
    timings.ocrMs === undefined ? undefined : `👁️ ${stageElapsed(timings.ocrMs)}`,
  ].filter((line): line is string => line !== undefined);

  return lines.length === 0 ? "" : ` - ${lines.join(" ")}`;
};

export const recognitionSuccessFeedback = (
  messageUrl: string,
  plates: ReadonlyArray<string>,
  elapsedMs: number,
  timings?: RecognitionTimings,
): string => `✅ ${photo(messageUrl)} — ДНЗ: ${plates.map((plate) => `<code>${plate}</code>`).join(", ")}\n⏱ ${elapsed(elapsedMs)}${timingFeedback(timings)}`;

export const recognitionNoPlateFeedback = (
  messageUrl: string,
  elapsedMs: number,
  timings?: RecognitionTimings,
): string => `⚠️ ${photo(messageUrl)} — ДНЗ не розпізнано.\n⏱ ${elapsed(elapsedMs)}${timingFeedback(timings)}`;

export const recognitionTimeoutFeedback = (
  messageUrl: string,
  elapsedMs: number,
  timings?: RecognitionTimings,
): string => `⌛ ${photo(messageUrl)} — час аналізу вичерпано.\n⏱ ${elapsed(elapsedMs)}${timingFeedback(timings)}`;

export const recognitionCrashFeedback = (
  messageUrl: string,
  elapsedMs: number,
  timings?: RecognitionTimings,
): string => `❌ ${photo(messageUrl)} — помилка аналізу.\n⏱ ${elapsed(elapsedMs)}${timingFeedback(timings)}`;
