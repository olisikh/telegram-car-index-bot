import { describe, expect, it } from "vitest";
import { fastPlateOcrMode } from "../src/fast-plate-ocr-policy.js";

describe("fastPlateOcrMode", () => {
  it("keeps Flow 3 in shadow mode without an explicit index acknowledgement", () => {
    expect(() => fastPlateOcrMode("index", undefined)).toThrow("FAST_PLATE_OCR_ALLOW_INDEX=true");
  });

  it("allows Flow 3 shadow benchmarking", () => {
    expect(fastPlateOcrMode("shadow", undefined)).toBe("shadow");
  });

  it("allows indexing only with an explicit acknowledgement", () => {
    expect(fastPlateOcrMode("index", "true")).toBe("index");
  });
});
