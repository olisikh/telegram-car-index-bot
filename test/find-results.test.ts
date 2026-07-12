import { describe, expect, it } from "vitest";
import { formatFindResult } from "../src/find-results.js";

describe("formatFindResult", () => {
  it("renders a compact safe label and clickable link within the 83-character visible-line budget", () => {
    const formatted = formatFindResult({
      plate: "AA1234BB",
      chatId: -100123,
      messageUrl: "https://t.me/c/123/42",
      messagePreview: "x".repeat(66),
      createdAt: "2026-07-13 12:00:00",
    }, 9999);

    expect(formatted).toBe(`9999. <a href="https://t.me/c/123/42">відкрити</a> — ${"x".repeat(66)}`);
    expect(`9999. відкрити — ${"x".repeat(66)}`).toHaveLength(83);
  });

  it("escapes preview text for Telegram HTML", () => {
    expect(formatFindResult({
      plate: "AA1234BB",
      chatId: -100123,
      messageUrl: "https://t.me/c/123/42",
      messagePreview: "oil & <filter>",
      createdAt: "2026-07-13 12:00:00",
    }, 1)).toContain("oil &amp; &lt;filter&gt;");
  });
});
