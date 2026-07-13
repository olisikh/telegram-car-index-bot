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

const PLATE_PROMPT = `Inspect this image for vehicle registration plates.
Return JSON only in exactly this shape: {"plates":["AA1234BB"]}.
Include every plate only when every character is clearly visible. Never guess, infer, or complete unreadable text. Return {"plates":[]} when no plate is clearly readable. Do not return explanations or markdown.`;

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

  readonly analyze = async (image: Uint8Array): Promise<ReadonlyArray<string>> => {
    const response = await this.fetcher(`${this.options.baseUrl.replace(/\/$/u, "")}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(this.options.timeoutMs),
      body: JSON.stringify({
        model: this.options.model,
        stream: false,
        format: plateFormat,
        messages: [{
          role: "user",
          content: PLATE_PROMPT,
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
}
