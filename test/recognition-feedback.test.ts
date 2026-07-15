import { describe, expect, it } from "vitest";
import {
  recognitionCrashFeedback,
  recognitionNoPlateFeedback,
  recognitionSuccessFeedback,
  recognitionTimeoutFeedback,
} from "../src/recognition-feedback.js";

const photoUrl = "https://t.me/c/123/42";

describe("recognition feedback", () => {
  it("renders English feedback by locale", () => {
    expect(recognitionSuccessFeedback("en", photoUrl, ["AE1131YF", "KA0001AX"], 15_430)).toBe(
      '✅ <a href="https://t.me/c/123/42">Photo</a> — Plate: <code>AE1131YF</code>, <code>KA0001AX</code>\n⏱ 15.4 s',
    );
    expect(recognitionNoPlateFeedback("en", photoUrl, 1_000)).toBe(
      '⚠️ <a href="https://t.me/c/123/42">Photo</a> — plate not recognized.\n⏱ 1.0 s',
    );
  });

  it("renders Ukrainian feedback by locale", () => {
    expect(recognitionSuccessFeedback("uk", photoUrl, ["AE1131YF"], 15_430)).toBe(
      '✅ <a href="https://t.me/c/123/42">Фото</a> — ДНЗ: <code>AE1131YF</code>\n⏱ 15,4 с',
    );
  });

  it("shows localized detector, crop, and OCR timings", () => {
    expect(recognitionSuccessFeedback("en", photoUrl, ["AE1131YF"], 15_430, {
      detectionMs: 82,
      croppingMs: 7,
      ocrMs: 15_341,
    })).toBe(
      '✅ <a href="https://t.me/c/123/42">Photo</a> — Plate: <code>AE1131YF</code>\n⏱ 15.4 s - 🕵️‍♂️ 82 ms ✂️ 7 ms 👁️ 15.3 s',
    );
  });

  it("reports timeout and crash outcomes without exposing internal errors", () => {
    expect(recognitionTimeoutFeedback("en", photoUrl, 60_000)).toBe(
      '⌛ <a href="https://t.me/c/123/42">Photo</a> — analysis timed out.\n⏱ 60.0 s',
    );
    expect(recognitionCrashFeedback("uk", photoUrl, 2_500)).toBe(
      '❌ <a href="https://t.me/c/123/42">Фото</a> — помилка аналізу.\n⏱ 2,5 с',
    );
  });
});
