export type RecognitionStrategy = "full-image" | "detector-crop";

export const recognitionStrategyFrom = (value: string | undefined): RecognitionStrategy => {
  const strategy = value ?? "full-image";
  if (strategy === "full-image" || strategy === "detector-crop") return strategy;
  throw new Error("PHOTO_RECOGNITION_STRATEGY must be full-image or detector-crop");
};
