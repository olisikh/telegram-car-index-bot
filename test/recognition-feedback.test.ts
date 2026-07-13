import { describe, expect, it } from "vitest";
import { recognitionFailureFeedback, recognitionFeedback } from "../src/recognition-feedback.js";

describe("recognitionFeedback", () => {
  it("reports every recognized plate", () => {
    expect(recognitionFeedback(["AE1131YF", "KA0001AX"])).toBe("✅ Розпізнано ДНЗ: AE1131YF, KA0001AX");
  });

  it("reports a readable no-result outcome", () => {
    expect(recognitionFeedback([])).toBe("⚠️ ДНЗ не розпізнано на цьому фото.");
  });

  it("reports a processing failure separately from no readable plate", () => {
    expect(recognitionFailureFeedback()).toBe("❌ Не вдалося проаналізувати фото. Надішліть його ще раз.");
  });
});
