import { messages, type Locale } from "./i18n.js";
import type { RecognitionTimings } from "./recognition-timings.js";

const stageElapsed = (locale: Locale, milliseconds: number): string => {
  const text = messages(locale);
  return milliseconds < 1_000 ? text.milliseconds(milliseconds) : text.seconds(milliseconds);
};

const photo = (locale: Locale, messageUrl: string): string =>
  `<a href="${messageUrl}">${messages(locale).photo}</a>`;

const timingFeedback = (locale: Locale, timings: RecognitionTimings | undefined): string => {
  if (!timings) return "";
  const lines = [
    timings.detectionMs === undefined ? undefined : `🕵️‍♂️ ${stageElapsed(locale, timings.detectionMs)}`,
    timings.croppingMs === undefined ? undefined : `✂️ ${stageElapsed(locale, timings.croppingMs)}`,
    timings.ocrMs === undefined ? undefined : `👁️ ${stageElapsed(locale, timings.ocrMs)}`,
  ].filter((line): line is string => line !== undefined);

  return lines.length === 0 ? "" : ` - ${lines.join(" ")}`;
};

export const recognitionSuccessFeedback = (
  locale: Locale,
  messageUrl: string,
  plates: ReadonlyArray<string>,
  elapsedMs: number,
  timings?: RecognitionTimings,
): string => {
  const text = messages(locale);
  return `✅ ${photo(locale, messageUrl)} — ${text.plate}: ${plates.map((plate) => `<code>${plate}</code>`).join(", ")}\n⏱ ${text.seconds(elapsedMs)}${timingFeedback(locale, timings)}`;
};

export const recognitionNoPlateFeedback = (
  locale: Locale,
  messageUrl: string,
  elapsedMs: number,
  timings?: RecognitionTimings,
): string => {
  const text = messages(locale);
  return `⚠️ ${photo(locale, messageUrl)} — ${text.plateNotRecognized}\n⏱ ${text.seconds(elapsedMs)}${timingFeedback(locale, timings)}`;
};

export const recognitionTimeoutFeedback = (
  locale: Locale,
  messageUrl: string,
  elapsedMs: number,
  timings?: RecognitionTimings,
): string => {
  const text = messages(locale);
  return `⌛ ${photo(locale, messageUrl)} — ${text.analysisTimedOut}\n⏱ ${text.seconds(elapsedMs)}${timingFeedback(locale, timings)}`;
};

export const recognitionCrashFeedback = (
  locale: Locale,
  messageUrl: string,
  elapsedMs: number,
  timings?: RecognitionTimings,
): string => {
  const text = messages(locale);
  return `❌ ${photo(locale, messageUrl)} — ${text.analysisFailed}\n⏱ ${text.seconds(elapsedMs)}${timingFeedback(locale, timings)}`;
};
