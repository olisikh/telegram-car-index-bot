import type { TimedRecognition } from "./recognition-timings";

export interface PlateAnalyzer {
  readonly analyze: (image: Uint8Array) => Promise<ReadonlyArray<string>>;
  readonly analyzeTimed?: (image: Uint8Array) => Promise<TimedRecognition>;
}
