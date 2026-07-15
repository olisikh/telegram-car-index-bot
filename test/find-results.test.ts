import { describe, expect, it } from "vitest";
import { formatFindResult } from "../src/find-results.js";

const result = {
  plate: "AA1234BB",
  chatId: -100123,
  messageUrl: "https://t.me/c/123/42",
  messagePreview: "photo",
  createdAt: "2026-07-13 11:25:00",
};

describe("formatFindResult", () => {
  it("renders the Kyiv date and English link label", () => {
    expect(formatFindResult("en", result, 1)).toBe(
      '1. AA1234BB · <a href="https://t.me/c/123/42">link</a> — 13.07.2026 14:25',
    );
  });

  it("renders the Ukrainian link label", () => {
    expect(formatFindResult("uk", result, 1)).toContain(">лінк</a> — 13.07.2026 14:25");
  });

  it("does not show a stored media preview for old photo records", () => {
    const formatted = formatFindResult("en", {
      ...result,
      messagePreview: "Мультимедіа",
      mediaTypes: "photo,video",
      createdAt: "2025-12-31 22:05:00",
    }, 1);

    expect(formatted).toContain("link</a> — 01.01.2026 00:05");
  });

  it("escapes the source URL for Telegram HTML", () => {
    expect(formatFindResult("en", {
      ...result,
      messageUrl: "https://t.me/c/123/42?one=1&two=2",
      createdAt: "2026-07-13 12:00:00",
    }, 1)).toContain('href="https://t.me/c/123/42?one=1&amp;two=2"');
  });
});
