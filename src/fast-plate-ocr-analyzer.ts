import { spawn } from "node:child_process";
import { recognizedPlates, type VisionAnalyzer } from "./ollama-vision.js";

type ReaderRunner = (command: string, args: ReadonlyArray<string>, input: string, timeoutMs: number) => Promise<string>;

export interface PythonFastPlateOcrAnalyzerOptions {
  readonly pythonPath: string;
  readonly scriptPath: string;
  readonly detectorModelPath: string;
  readonly ocrModel: string;
  readonly timeoutMs?: number;
  readonly run?: ReaderRunner;
}

const timeoutError = (): Error => {
  const error = new Error("local FastPlateOCR reader timed out");
  error.name = "TimeoutError";
  return error;
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

export class PythonFastPlateOcrAnalyzer implements VisionAnalyzer {
  private readonly run: ReaderRunner;

  constructor(private readonly options: PythonFastPlateOcrAnalyzerOptions) {
    this.run = options.run ?? runReaderProcess;
  }

  readonly analyze = async (image: Uint8Array): Promise<ReadonlyArray<string>> => {
    const output = await this.run(
      this.options.pythonPath,
      [
        this.options.scriptPath,
        "--model", this.options.detectorModelPath,
        "--reader", "fast-plate-ocr",
        "--ocr-model", this.options.ocrModel,
      ],
      JSON.stringify({ imageBase64: Buffer.from(image).toString("base64") }),
      this.options.timeoutMs ?? 60_000,
    );
    return recognizedPlates(output);
  };
}
