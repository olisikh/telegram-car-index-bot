import type { TimedRecognition } from "./recognition-timings";

export interface PlateAnalysisOptions {
  readonly collectionDirectory?: string;
}

export interface PlateAnalyzer {
  readonly analyze: (image: Uint8Array, options?: PlateAnalysisOptions) => Promise<ReadonlyArray<string>>;
  readonly analyzeTimed?: (image: Uint8Array, options?: PlateAnalysisOptions) => Promise<TimedRecognition>;
}
