import { normalizePlate } from "./plates.js";

export interface VisionAnalyzer {
  readonly analyze: (image: Uint8Array) => Promise<ReadonlyArray<string>>;
}

export interface OllamaVisionOptions {
  readonly baseUrl: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly fetcher?: typeof fetch;
}

const PLATE_PROMPT = `Inspect every visible vehicle for registration plates. Do not stop at an overview: closely inspect the front and rear plate regions of each vehicle before deciding there is no readable plate.
Return JSON only in exactly this shape: {"plates":["AA1234BB"]}.
Include every plate only when every character is clearly visible. For a vehicle marked "ПОЛІЦІЯ", closely inspect its blue front/rear special plate; Ukrainian National Police plates use exactly four digits. Include that four-digit identifier when it is clearly visible, but do not treat other four-digit text as a plate. Never guess, infer, or complete unreadable text. Return {"plates":[]} when no plate is clearly readable. Do not return explanations or markdown.`;

const POLICE_PLATE_PROMPT = `Carefully determine whether a vehicle has visible Ukrainian National Police markings or a blue Ukrainian police plate. Only if you can visibly confirm that, inspect its blue front/rear license plate and return its exactly four visible digits.
Return JSON only in exactly this shape: {"plates":["2793"]}. Do not treat any other four-digit text as a plate. Never guess, infer, or complete unreadable text. Return {"plates":[]} when no confirmed Ukrainian National Police plate is clearly readable. Do not return explanations or markdown.`;

const plateFormat = {
  type: "object",
  properties: {
    plates: {
      type: "array",
      items: { type: "string" },
      maxItems: 10,
    },
  },
  required: ["plates"],
  additionalProperties: false,
};

const normalizeRecognizedPlate = (value: string): string | undefined =>
  normalizePlate(value.replace(/[\s-]/gu, ""));

export const recognizedPlates = (content: string): ReadonlyArray<string> => {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { plates?: unknown }).plates)) return [];
    return [...new Set((parsed as { plates: unknown[] }).plates
      .filter((plate): plate is string => typeof plate === "string")
      .map(normalizeRecognizedPlate)
      .filter((plate): plate is string => plate !== undefined))];
  } catch {
    return [];
  }
};

export class OllamaVisionAnalyzer implements VisionAnalyzer {
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: OllamaVisionOptions) {
    this.fetcher = options.fetcher ?? fetch;
  }

  private readonly analyzePrompt = async (
    prompt: string,
    image: Uint8Array,
    timeoutMs: number,
  ): Promise<ReadonlyArray<string>> => {
    const response = await this.fetcher(`${this.options.baseUrl.replace(/\/$/u, "")}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model: this.options.model,
        stream: false,
        format: plateFormat,
        messages: [{
          role: "user",
          content: prompt,
          images: [Buffer.from(image).toString("base64")],
        }],
      }),
    });
    if (!response.ok) throw new Error(`Ollama vision request failed: ${response.status}`);

    const responseBody: unknown = await response.json();
    const content = responseBody && typeof responseBody === "object"
      ? (responseBody as { message?: { content?: unknown } }).message?.content
      : undefined;
    return typeof content === "string" ? recognizedPlates(content) : [];
  };

  readonly analyze = async (image: Uint8Array): Promise<ReadonlyArray<string>> => {
    const startedAt = Date.now();
    const plates = await this.analyzePrompt(PLATE_PROMPT, image, this.options.timeoutMs);
    if (plates.length > 0) return plates;

    const remainingMs = this.options.timeoutMs - (Date.now() - startedAt);
    if (remainingMs < 1) return [];
    return this.analyzePrompt(POLICE_PLATE_PROMPT, image, remainingMs);
  };
}
