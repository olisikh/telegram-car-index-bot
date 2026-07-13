import { describe, expect, it, vi } from "vitest";
import { PythonPlateCropDetector } from "../src/plate-detector.js";

describe("PythonPlateCropDetector", () => {
  it("passes image bytes to the local detector and returns decoded crops", async () => {
    const run = vi.fn().mockResolvedValue(JSON.stringify({
      crops: [{ imageBase64: Buffer.from([4, 5, 6]).toString("base64"), confidence: 0.8, box: [1, 2, 3, 4] }],
    }));
    const detector = new PythonPlateCropDetector({
      pythonPath: "/venv/bin/python",
      scriptPath: "/project/scripts/detect_plate_crops.py",
      modelPath: "/project/models/license-plate-detector.pt",
      run,
    });

    await expect(detector.detect(Uint8Array.from([1, 2, 3]))).resolves.toEqual([Uint8Array.from([4, 5, 6])]);
    expect(run).toHaveBeenCalledWith(
      "/venv/bin/python",
      ["/project/scripts/detect_plate_crops.py", "--model", "/project/models/license-plate-detector.pt"],
      JSON.stringify({ imageBase64: "AQID" }),
    );
  });

  it("rejects malformed detector output", async () => {
    const detector = new PythonPlateCropDetector({
      pythonPath: "python", scriptPath: "detect.py", modelPath: "model.pt",
      run: async () => '{"crops":"not-an-array"}',
    });

    await expect(detector.detect(Uint8Array.from([1]))).rejects.toThrow("invalid crop output");
  });
});
