export const recognitionFeedback = (plates: ReadonlyArray<string>): string =>
  plates.length > 0
    ? `✅ Розпізнано ДНЗ: ${plates.join(", ")}`
    : "⚠️ ДНЗ не розпізнано на цьому фото.";

export const recognitionFailureFeedback = (): string =>
  "❌ Не вдалося проаналізувати фото. Надішліть його ще раз.";
