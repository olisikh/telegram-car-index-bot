import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, mock } from "bun:test";
import { PythonFastPlateOcrAnalyzer } from "../src/fast-plate-ocr-analyzer";

describe("opt-in crop collection", () => {
  it("writes a portable manifest for standard-pass crops when collection is enabled", async () => {
    const directory = mkdtempSync(join(tmpdir(), "car-index-collection-"));
    const run = mock().mockResolvedValue(JSON.stringify({
      plates: ["AA1234BB"],
      captures: [{
        sampleId: "sample-1",
        cropPath: "crops/2026-07-16/sample-1.png",
        detectorConfidence: 0.84,
        profile: "standard",
      }],
      timings: { detectionMs: 1, croppingMs: 2, ocrMs: 3 },
    }));
    const analyzer = new PythonFastPlateOcrAnalyzer({
      pythonPath: "python",
      scriptPath: "detect.py",
      detectorModelPath: "model.pt",
      ocrModel: "cct-s-v2-global-model",
      recoveryAttempts: 0,
      run,
    });

    await expect(analyzer.analyzeTimed(Uint8Array.from([1]), { collectionDirectory: directory })).resolves.toEqual({
      plates: ["AA1234BB"],
      timings: { detectionMs: 1, croppingMs: 2, ocrMs: 3 },
    });

    expect(run).toHaveBeenCalledWith(
      "python",
      ["detect.py", "--model", "model.pt", "--ocr-model", "cct-s-v2-global-model", "--profile", "standard", "--collection-dir", directory],
      JSON.stringify({ imageBase64: "AQ==" }),
      60_000,
    );
    const [entry] = readFileSync(join(directory, "manifest.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(entry).toMatchObject({
      schemaVersion: 1,
      capturedAt: expect.any(String),
      reader: "cct-s-v2-global-model",
      validatedPlates: ["AA1234BB"],
      reviewStatus: "unreviewed",
      crops: [{
        sampleId: "sample-1",
        cropPath: "crops/2026-07-16/sample-1.png",
        detectorConfidence: 0.84,
        profile: "standard",
      }],
    });
    expect(JSON.stringify(entry)).not.toContain("chatId");
    expect(JSON.stringify(entry)).not.toContain("messageUrl");
    rmSync(directory, { recursive: true, force: true });
  });
});
