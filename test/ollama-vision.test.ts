import { describe, expect, it, vi } from "vitest";
import { OllamaVisionAnalyzer, recognizedPlates } from "../src/ollama-vision.js";

describe("recognizedPlates", () => {
  it("accepts only valid normalized plates from strict JSON", () => {
    expect(recognizedPlates('{"plates":["АА1234ВВ", "AA 1234 BB", "not a plate", "AA1234BB"]}')).toEqual([
      "AA1234BB",
    ]);
  });

  it("rejects malformed or non-conforming responses", () => {
    expect(recognizedPlates("not json")).toEqual([]);
    expect(recognizedPlates('{"plates":"AA1234BB"}')).toEqual([]);
  });
});

describe("OllamaVisionAnalyzer", () => {
  it("sends a base64 photo and requests structured plate JSON", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: { content: '{"plates":["AA1234BB"]}' },
    }), { status: 200 }));
    const analyzer = new OllamaVisionAnalyzer({
      baseUrl: "http://127.0.0.1:11434",
      model: "gemma4:latest",
      timeoutMs: 1000,
      fetcher,
    });

    await expect(analyzer.analyze(Uint8Array.from([1, 2, 3]))).resolves.toEqual(["AA1234BB"]);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, options] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:11434/api/chat");
    expect(options.method).toBe("POST");
    expect(JSON.parse(String(options.body))).toMatchObject({
      model: "gemma4:latest",
      stream: false,
      messages: [{ images: ["AQID"] }],
    });
  });

  it("fails safely when Ollama returns an error", async () => {
    const analyzer = new OllamaVisionAnalyzer({
      baseUrl: "http://127.0.0.1:11434",
      model: "gemma4:latest",
      timeoutMs: 1000,
      fetcher: vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })),
    });

    await expect(analyzer.analyze(Uint8Array.from([1]))).rejects.toThrow("Ollama vision request failed: 503");
  });
});
