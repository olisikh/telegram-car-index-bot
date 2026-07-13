import type { TimedRecognition } from "./recognition-timings.js";

export interface PlateAnalyzer {
  readonly analyze: (image: Uint8Array) => Promise<ReadonlyArray<string>>;
  readonly analyzeTimed?: (image: Uint8Array) => Promise<TimedRecognition>;
}
