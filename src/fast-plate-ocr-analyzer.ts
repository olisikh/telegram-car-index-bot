import { spawn } from "node:child_process";
import { recognizedPlates, type VisionAnalyzer } from "./ollama-vision.js";

type ReaderRunner = (command: string, args: ReadonlyArray<string>, input: string) => Promise<string>;

export interface PythonFastPlateOcrAnalyzerOptions {
  readonly pythonPath: string;
  readonly scriptPath: string;
  readonly detectorModelPath: string;
  readonly ocrModel: string;
  readonly run?: ReaderRunner;
}

const runReaderProcess: ReaderRunner = (command, args, input) => new Promise((resolve, reject) => {
  const child = spawn(command, [...args], { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
  child.on("error", reject);
  child.on("close", (code) => {
    if (code === 0) resolve(stdout);
    else reject(new Error(`local FastPlateOCR reader failed (${code ?? "unknown"}): ${stderr.trim()}`));
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
    );
    return recognizedPlates(output);
  };
}
