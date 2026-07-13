import { describe, expect, it } from "vitest";
import { recognitionStrategyFrom } from "../src/recognition-strategy.js";

describe("recognitionStrategyFrom", () => {
  it("uses full-image mode by default", () => {
    expect(recognitionStrategyFrom(undefined)).toBe("full-image");
  });

  it("accepts detector-crop mode", () => {
    expect(recognitionStrategyFrom("detector-crop")).toBe("detector-crop");
  });

  it("rejects unsupported recognition modes", () => {
    expect(() => recognitionStrategyFrom("everything")).toThrow("PHOTO_RECOGNITION_STRATEGY");
  });
});
