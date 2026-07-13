import { describe, expect, it } from "vitest";
import { mediaTypeFromMessage } from "../src/message-media-type.js";

describe("mediaTypeFromMessage", () => {
  it("recognizes Telegram photos", () => {
    expect(mediaTypeFromMessage({ photo: [] })).toBe("photo");
  });

  it("recognizes native Telegram videos and animations", () => {
    expect(mediaTypeFromMessage({ video: {} })).toBe("video");
    expect(mediaTypeFromMessage({ animation: {} })).toBe("video");
  });

  it("recognizes a video sent as a file", () => {
    expect(mediaTypeFromMessage({ document: { mime_type: "video/mp4" } })).toBe("video");
  });

  it("does not classify non-video documents as media", () => {
    expect(mediaTypeFromMessage({ document: { mime_type: "application/pdf" } })).toBeUndefined();
  });
});
