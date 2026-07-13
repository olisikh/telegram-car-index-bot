import { spawn } from "node:child_process";
import type { RecognitionTimings } from "./recognition-timings.js";

export interface PlateCropDetection {
  readonly crops: ReadonlyArray<Uint8Array>;
  readonly timings: RecognitionTimings;
}

export interface PlateCropDetector {
  readonly detect: (image: Uint8Array) => Promise<ReadonlyArray<Uint8Array>>;
  readonly detectTimed?: (image: Uint8Array) => Promise<PlateCropDetection>;
}

type DetectorRunner = (command: string, args: ReadonlyArray<string>, input: string) => Promise<string>;

export interface PythonPlateCropDetectorOptions {
  readonly pythonPath: string;
  readonly scriptPath: string;
  readonly modelPath: string;
  readonly run?: DetectorRunner;
}

const runDetectorProcess: DetectorRunner = (command, args, input) => new Promise((resolve, reject) => {
  const child = spawn(command, [...args], { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
  child.on("error", reject);
  child.on("close", (code) => {
    if (code === 0) resolve(stdout);
    else reject(new Error(`local plate detector failed (${code ?? "unknown"}): ${stderr.trim()}`));
  });
  child.stdin.end(input);
});

const duration = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;

const detectorTimings = (value: unknown): RecognitionTimings => {
  const timings = value && typeof value === "object" ? value as { detectionMs?: unknown; croppingMs?: unknown } : {};
  return { detectionMs: duration(timings.detectionMs), croppingMs: duration(timings.croppingMs) };
};

export class PythonPlateCropDetector implements PlateCropDetector {
  private readonly run: DetectorRunner;

  constructor(private readonly options: PythonPlateCropDetectorOptions) {
    this.run = options.run ?? runDetectorProcess;
  }

  readonly detectTimed = async (image: Uint8Array): Promise<PlateCropDetection> => {
    const output = await this.run(
      this.options.pythonPath,
      [this.options.scriptPath, "--model", this.options.modelPath],
      JSON.stringify({ imageBase64: Buffer.from(image).toString("base64") }),
    );
    let parsed: unknown;
    try {
      parsed = JSON.parse(output);
    } catch {
      throw new Error("local plate detector returned invalid crop output");
    }
    const record = parsed && typeof parsed === "object" ? parsed as { crops?: unknown; timings?: unknown } : undefined;
    if (!record || !Array.isArray(record.crops)) throw new Error("local plate detector returned invalid crop output");
    const crops = record.crops.map((crop) => {
      const value = crop && typeof crop === "object" ? (crop as { imageBase64?: unknown }).imageBase64 : undefined;
      if (typeof value !== "string" || value.length === 0) {
        throw new Error("local plate detector returned invalid crop output");
      }
      return Uint8Array.from(Buffer.from(value, "base64"));
    });
    return { crops, timings: detectorTimings(record.timings) };
  };

  readonly detect = async (image: Uint8Array): Promise<ReadonlyArray<Uint8Array>> => (await this.detectTimed(image)).crops;
}
