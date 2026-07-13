import { describe, expect, it, vi } from "vitest";
import { PythonFastPlateOcrAnalyzer, runReaderProcess } from "../src/fast-plate-ocr-analyzer.js";

describe("PythonFastPlateOcrAnalyzer", () => {
  it("runs the detector and FastPlateOCR reader once per source photo and validates its output", async () => {
    const run = vi.fn().mockResolvedValue('{"plates":["АА 1234 ВВ", "not-a-plate", "2923"]}');
    const analyzer = new PythonFastPlateOcrAnalyzer({
      pythonPath: "/venv/bin/python",
      scriptPath: "/project/scripts/detect_and_read_plates.py",
      detectorModelPath: "/project/models/license-plate-detector.pt",
      ocrModel: "cct-s-v2-global-model",
      run,
    });

    await expect(analyzer.analyze(Uint8Array.from([1, 2, 3]))).resolves.toEqual(["AA1234BB", "2923"]);
    expect(run).toHaveBeenCalledWith(
      "/venv/bin/python",
      [
        "/project/scripts/detect_and_read_plates.py",
        "--model", "/project/models/license-plate-detector.pt",
        "--ocr-model", "cct-s-v2-global-model",
        "--profile", "standard",
      ],
      JSON.stringify({ imageBase64: "AQID" }),
      60_000,
    );
  });

  it("silently retries alternate profiles only after no valid plate", async () => {
    const run = vi.fn()
      .mockResolvedValueOnce('{"plates":[],"detections":0,"timings":{"detectionMs":600,"croppingMs":5,"ocrMs":1400}}')
      .mockResolvedValueOnce('{"plates":["AA1234BB"],"timings":{"detectionMs":650,"croppingMs":8,"ocrMs":1500}}')
      .mockResolvedValueOnce('{"plates":["AA1234BB"],"timings":{"detectionMs":700,"croppingMs":9,"ocrMs":1600}}');
    const analyzer = new PythonFastPlateOcrAnalyzer({
      pythonPath: "python",
      scriptPath: "detect.py",
      detectorModelPath: "model.pt",
      ocrModel: "reader",
      recoveryAttempts: 2,
      run,
    });

    await expect(analyzer.analyzeTimed(Uint8Array.from([1]))).resolves.toEqual({
      plates: ["AA1234BB"],
      timings: { detectionMs: 1950, croppingMs: 22, ocrMs: 4500 },
    });
    expect(run).toHaveBeenNthCalledWith(1, "python", ["detect.py", "--model", "model.pt", "--ocr-model", "reader", "--profile", "standard"], JSON.stringify({ imageBase64: "AQ==" }), 60_000);
    expect(run).toHaveBeenNthCalledWith(2, "python", ["detect.py", "--model", "model.pt", "--ocr-model", "reader", "--profile", "wide"], JSON.stringify({ imageBase64: "AQ==" }), expect.any(Number));
  });

  it("returns detector, crop, and OCR timings from the local reader", async () => {
    const analyzer = new PythonFastPlateOcrAnalyzer({
      pythonPath: "python",
      scriptPath: "detect.py",
      detectorModelPath: "model.pt",
      ocrModel: "reader",
      run: async () => JSON.stringify({
        plates: ["AA1234BB"],
        timings: { detectionMs: 900, croppingMs: 5, ocrMs: 1_200 },
      }),
    });

    await expect(analyzer.analyzeTimed(Uint8Array.from([1]))).resolves.toEqual({
      plates: ["AA1234BB"],
      timings: { detectionMs: 900, croppingMs: 5, ocrMs: 1_200 },
    });
  });

  it("fails safely when the local reader returns malformed output", async () => {
    const analyzer = new PythonFastPlateOcrAnalyzer({
      pythonPath: "python",
      scriptPath: "detect.py",
      detectorModelPath: "model.pt",
      ocrModel: "reader",
      run: async () => "not-json",
    });

    await expect(analyzer.analyze(Uint8Array.from([1]))).resolves.toEqual([]);
  });

  it("terminates a reader process that exceeds its timeout", async () => {
    await expect(runReaderProcess(process.execPath, ["-e", "setTimeout(() => {}, 1_000)"], "", 25))
      .rejects.toMatchObject({ name: "TimeoutError" });
  });
});
