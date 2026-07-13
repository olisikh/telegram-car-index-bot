export type RecognitionStrategy = "full-image" | "detector-crop" | "detector-fast-ocr";

export const recognitionStrategyFrom = (value: string | undefined): RecognitionStrategy => {
  const strategy = value ?? "full-image";
  if (strategy === "full-image" || strategy === "detector-crop" || strategy === "detector-fast-ocr") return strategy;
  throw new Error("PHOTO_RECOGNITION_STRATEGY must be full-image, detector-crop, or detector-fast-ocr");
};
