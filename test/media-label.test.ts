import { describe, expect, it } from "vitest";
import { mediaLabel } from "../src/media-label.js";

describe("mediaLabel", () => {
  it("names media in English", () => {
    expect(mediaLabel("en", "photo")).toBe("Photo");
    expect(mediaLabel("en", "video")).toBe("Video");
    expect(mediaLabel("en", "photo,video")).toBe("Photo and Video");
  });

  it("names media in Ukrainian", () => {
    expect(mediaLabel("uk", "photo")).toBe("Фото");
    expect(mediaLabel("uk", "video")).toBe("Відео");
    expect(mediaLabel("uk", "photo,video")).toBe("Фото і Відео");
  });

  it("returns undefined without a recognized media type", () => {
    expect(mediaLabel("en")).toBeUndefined();
  });
});
