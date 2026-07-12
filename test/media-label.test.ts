import { describe, expect, it } from "vitest";
import { mediaLabel } from "../src/media-label.js";

describe("mediaLabel", () => {
  it("names a single photo", () => {
    expect(mediaLabel("photo")).toBe("Фото");
  });

  it("names a single video", () => {
    expect(mediaLabel("video")).toBe("Відео");
  });

  it("names a mixed photo and video album", () => {
    expect(mediaLabel("photo,video")).toBe("Фото і Відео");
  });

  it("does not label an unknown or missing media type", () => {
    expect(mediaLabel(undefined)).toBeUndefined();
    expect(mediaLabel("document")).toBeUndefined();
  });
});
