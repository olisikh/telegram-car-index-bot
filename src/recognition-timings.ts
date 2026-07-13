export interface RecognitionTimings {
  readonly detectionMs?: number;
  readonly croppingMs?: number;
  readonly ocrMs?: number;
}

export interface TimedRecognition {
  readonly plates: ReadonlyArray<string>;
  readonly timings: RecognitionTimings;
}
