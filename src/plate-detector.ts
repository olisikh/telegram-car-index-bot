import { spawn } from "node:child_process";

export interface PlateCropDetector {
  readonly detect: (image: Uint8Array) => Promise<ReadonlyArray<Uint8Array>>;
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

export class PythonPlateCropDetector implements PlateCropDetector {
  private readonly run: DetectorRunner;

  constructor(private readonly options: PythonPlateCropDetectorOptions) {
    this.run = options.run ?? runDetectorProcess;
  }

  readonly detect = async (image: Uint8Array): Promise<ReadonlyArray<Uint8Array>> => {
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
    const crops = parsed && typeof parsed === "object" ? (parsed as { crops?: unknown }).crops : undefined;
    if (!Array.isArray(crops)) throw new Error("local plate detector returned invalid crop output");
    return crops.map((crop) => {
      const value = crop && typeof crop === "object" ? (crop as { imageBase64?: unknown }).imageBase64 : undefined;
      if (typeof value !== "string" || value.length === 0) {
        throw new Error("local plate detector returned invalid crop output");
      }
      return Uint8Array.from(Buffer.from(value, "base64"));
    });
  };
}
