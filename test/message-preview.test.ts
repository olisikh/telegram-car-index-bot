import { describe, expect, it } from "vitest";
import { carMessagePreview, MESSAGE_PREVIEW_MAX_LENGTH } from "../src/message-preview.js";

describe("carMessagePreview", () => {
  it("omits the command and plate, then normalizes the remaining message", () => {
    expect(carMessagePreview("/car AA1234BB   maintenance\ncomplete", false))
      .toBe("maintenance complete");
  });

  it("uses Мультимедіа when a media command has no note", () => {
    expect(carMessagePreview("/car AA1234BB", true)).toBe("Мультимедіа");
  });

  it("truncates a note to the display-safe limit", () => {
    const preview = carMessagePreview(`/car AA1234BB ${"a".repeat(100)}`, false);
    expect([...preview]).toHaveLength(MESSAGE_PREVIEW_MAX_LENGTH);
    expect(preview.endsWith("…")).toBe(true);
  });
});
