import { describe, expect, it, vi } from "vitest";
import { PythonFastPlateOcrAnalyzer, runReaderProcess } from "../src/fast-plate-ocr-analyzer.js";

describe("PythonFastPlateOcrAnalyzer", () => {
  it("runs the detector and FastPlateOCR reader once per source photo and validates its output", async () => {
    const run = vi.fn().mockResolvedValue('{"plates":["АА 1234 ВВ", "not-a-plate", "2923"]}');
    const analyzer = new PythonFastPlateOcrAnalyzer({
      pythonPath: "/venv/bin/python",
      scriptPath: "/project/scripts/detect_plate_crops.py",
      detectorModelPath: "/project/models/license-plate-detector.pt",
      ocrModel: "cct-s-v2-global-model",
      run,
    });

    await expect(analyzer.analyze(Uint8Array.from([1, 2, 3]))).resolves.toEqual(["AA1234BB", "2923"]);
    expect(run).toHaveBeenCalledWith(
      "/venv/bin/python",
      [
        "/project/scripts/detect_plate_crops.py",
        "--model", "/project/models/license-plate-detector.pt",
        "--reader", "fast-plate-ocr",
        "--ocr-model", "cct-s-v2-global-model",
      ],
      JSON.stringify({ imageBase64: "AQID" }),
      60_000,
    );
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
