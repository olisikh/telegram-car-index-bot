import { spawn } from "node:child_process";
import { recognizedPlates } from "./recognized-plates";
import type { PlateAnalyzer } from "./plate-analyzer";
import type { RecognitionTimings, TimedRecognition } from "./recognition-timings";

type ReaderRunner = (command: string, args: ReadonlyArray<string>, input: string, timeoutMs: number) => Promise<string>;

export interface PythonFastPlateOcrAnalyzerOptions {
  readonly pythonPath: string;
  readonly scriptPath: string;
  readonly detectorModelPath: string;
  readonly ocrModel: string;
  readonly timeoutMs?: number;
  readonly recoveryAttempts?: number;
  readonly run?: ReaderRunner;
}

const timeoutError = (): Error => {
  const error = new Error("local FastPlateOCR reader timed out");
  error.name = "TimeoutError";
  return error;
};

const duration = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;

const readerTimings = (output: string): RecognitionTimings => {
  try {
    const parsed: unknown = JSON.parse(output);
    const timings = parsed && typeof parsed === "object" ? (parsed as { timings?: unknown }).timings : undefined;
    const record = timings && typeof timings === "object"
      ? timings as { detectionMs?: unknown; croppingMs?: unknown; ocrMs?: unknown }
      : {};
    return {
      detectionMs: duration(record.detectionMs),
      croppingMs: duration(record.croppingMs),
      ocrMs: duration(record.ocrMs),
    };
  } catch {
    return {};
  }
};

const readerDetectionCount = (output: string): number => {
  try {
    const parsed: unknown = JSON.parse(output);
    const detections = parsed && typeof parsed === "object" ? (parsed as { detections?: unknown }).detections : undefined;
    return typeof detections === "number" && Number.isSafeInteger(detections) && detections >= 0 ? detections : 0;
  } catch {
    return 0;
  }
};

export const runReaderProcess: ReaderRunner = (command, args, input, timeoutMs) => new Promise((resolve, reject) => {
  const child = spawn(command, [...args], { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  let settled = false;
  const resolveOnce = (value: string): void => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    resolve(value);
  };
  const rejectOnce = (error: Error): void => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    reject(error);
  };
  const timer = setTimeout(() => {
    child.kill();
    rejectOnce(timeoutError());
  }, timeoutMs);
  child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
  child.on("error", rejectOnce);
  child.on("close", (code) => {
    if (code === 0) resolveOnce(stdout);
    else rejectOnce(new Error(`local FastPlateOCR reader failed (${code ?? "unknown"}): ${stderr.trim()}`));
  });
  child.stdin.end(input);
});

export class PythonFastPlateOcrAnalyzer implements PlateAnalyzer {
  private readonly run: ReaderRunner;

  constructor(private readonly options: PythonFastPlateOcrAnalyzerOptions) {
    this.run = options.run ?? runReaderProcess;
  }

  readonly analyze = async (image: Uint8Array): Promise<ReadonlyArray<string>> => (await this.analyzeTimed(image)).plates;

  readonly analyzeTimed = async (image: Uint8Array): Promise<TimedRecognition> => {
    const profiles = ["standard", "wide", "enhanced"].slice(0, 1 + Math.min(2, Math.max(0, this.options.recoveryAttempts ?? 2)));
    const input = JSON.stringify({ imageBase64: Buffer.from(image).toString("base64") });
    const deadline = Date.now() + (this.options.timeoutMs ?? 60_000);
    const totals = { detectionMs: 0, croppingMs: 0, ocrMs: 0 };
    let recoveryCandidate: ReadonlyArray<string> = [];
    for (const [index, profile] of profiles.entries()) {
      const remainingMs = deadline - Date.now();
      if (remainingMs < 1) throw timeoutError();
      const output = await this.run(
        this.options.pythonPath,
        [
          this.options.scriptPath,
          "--model", this.options.detectorModelPath,
          "--ocr-model", this.options.ocrModel,
          "--profile", profile,
        ],
        input,
        remainingMs,
      );
      const timings = readerTimings(output);
      totals.detectionMs += timings.detectionMs ?? 0;
      totals.croppingMs += timings.croppingMs ?? 0;
      totals.ocrMs += timings.ocrMs ?? 0;
      const plates = recognizedPlates(output);
      if (index === 0 && plates.length > 0) return { plates, timings: totals };
      if (index === 0 && readerDetectionCount(output) > 0) return { plates: [], timings: totals };
      if (index > 0 && plates.length > 0) {
        if (recoveryCandidate.some((plate) => plates.includes(plate))) return { plates, timings: totals };
        recoveryCandidate = plates;
      }
    }
    return { plates: [], timings: totals };
  };
}
