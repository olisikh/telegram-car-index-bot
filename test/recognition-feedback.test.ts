import { describe, expect, it } from "vitest";
import {
  recognitionCrashFeedback,
  recognitionNoPlateFeedback,
  recognitionSuccessFeedback,
  recognitionTimeoutFeedback,
} from "../src/recognition-feedback.js";

const photoUrl = "https://t.me/c/123/42";

describe("recognition feedback", () => {
  it("links the photo, plate result, and elapsed time on success", () => {
    expect(recognitionSuccessFeedback(photoUrl, ["AE1131YF", "KA0001AX"], 15_430)).toBe(
      '✅ <a href="https://t.me/c/123/42">Фото</a> — ДНЗ: <code>AE1131YF</code>, <code>KA0001AX</code>\n⏱ 15.4 с',
    );
  });

  it("shows detector, crop, and OCR timings when the analyzer provides them", () => {
    expect(recognitionSuccessFeedback(photoUrl, ["AE1131YF"], 15_430, {
      detectionMs: 82,
      croppingMs: 7,
      ocrMs: 15_341,
    })).toBe(
      '✅ <a href="https://t.me/c/123/42">Фото</a> — ДНЗ: <code>AE1131YF</code>\n⏱ 15.4 с - 🕵️‍♂️ 82 мс - ✂️ 7 мс - 👁️ 15.3 с',
    );
  });

  it("reports no readable plate with its photo link and elapsed time", () => {
    expect(recognitionNoPlateFeedback(photoUrl, 1_000)).toBe(
      '⚠️ <a href="https://t.me/c/123/42">Фото</a> — ДНЗ не розпізнано.\n⏱ 1.0 с',
    );
  });

  it("reports timeout and crash outcomes without exposing internal errors", () => {
    expect(recognitionTimeoutFeedback(photoUrl, 60_000)).toBe(
      '⌛ <a href="https://t.me/c/123/42">Фото</a> — час аналізу вичерпано.\n⏱ 60.0 с',
    );
    expect(recognitionCrashFeedback(photoUrl, 2_500)).toBe(
      '❌ <a href="https://t.me/c/123/42">Фото</a> — помилка аналізу.\n⏱ 2.5 с',
    );
  });
});
