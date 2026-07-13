import type { VisionAnalyzer } from "./ollama-vision.js";
import type { PlateCropDetector } from "./plate-detector.js";

export class DetectorCropVisionAnalyzer implements VisionAnalyzer {
  constructor(
    private readonly detector: PlateCropDetector,
    private readonly reader: VisionAnalyzer,
  ) {}

  readonly analyze = async (image: Uint8Array): Promise<ReadonlyArray<string>> => {
    const crops = await this.detector.detect(image);
    const results = await Promise.all(crops.map((crop) => this.reader.analyze(crop)));
    return [...new Set(results.flat())];
  };
}
