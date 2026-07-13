import { describe, expect, it } from "vitest";
import { DetectorCropVisionAnalyzer } from "../src/detector-crop-analyzer.js";

describe("DetectorCropVisionAnalyzer", () => {
  it("reads each detected crop and returns unique plates", async () => {
    const analyzer = new DetectorCropVisionAnalyzer(
      { detect: async () => [Uint8Array.from([1]), Uint8Array.from([2])] },
      { analyze: async (crop) => crop[0] === 1 ? ["AE1131YF", "2793"] : ["2793"] },
    );

    await expect(analyzer.analyze(Uint8Array.from([9]))).resolves.toEqual(["AE1131YF", "2793"]);
  });

  it("returns no plate when the detector finds no crop", async () => {
    const analyzer = new DetectorCropVisionAnalyzer(
      { detect: async () => [] },
      { analyze: async () => { throw new Error("reader must not run"); } },
    );

    await expect(analyzer.analyze(Uint8Array.from([9]))).resolves.toEqual([]);
  });
});
