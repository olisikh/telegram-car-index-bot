import type { RecognitionMode } from "./photo-recognition.js";

export const fastPlateOcrMode = (
  requestedMode: RecognitionMode,
  indexAcknowledgement: string | undefined,
): RecognitionMode => {
  if (requestedMode === "shadow" || indexAcknowledgement === "true") return requestedMode;
  throw new Error("detector-fast-ocr requires FAST_PLATE_OCR_ALLOW_INDEX=true before it can index records");
};
