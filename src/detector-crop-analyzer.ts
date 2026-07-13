import type { TimedRecognition } from "./recognition-timings.js";
import type { VisionAnalyzer } from "./ollama-vision.js";
import type { PlateCropDetector } from "./plate-detector.js";

export class DetectorCropVisionAnalyzer implements VisionAnalyzer {
  constructor(
    private readonly detector: PlateCropDetector,
    private readonly reader: VisionAnalyzer,
  ) {}

  readonly analyze = async (image: Uint8Array): Promise<ReadonlyArray<string>> => (await this.analyzeTimed(image)).plates;

  readonly analyzeTimed = async (image: Uint8Array): Promise<TimedRecognition> => {
    const detectorStartedAt = performance.now();
    const detection = this.detector.detectTimed
      ? await this.detector.detectTimed(image)
      : { crops: await this.detector.detect(image), timings: { detectionMs: performance.now() - detectorStartedAt } };
    const ocrStartedAt = performance.now();
    const results = await Promise.all(detection.crops.map((crop) => this.reader.analyze(crop)));
    return {
      plates: [...new Set(results.flat())],
      timings: { ...detection.timings, ocrMs: performance.now() - ocrStartedAt },
    };
  };
}
