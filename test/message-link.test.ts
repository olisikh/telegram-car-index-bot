import { describe, expect, it } from "bun:test";
import { messageLink } from "../src/message-link";

describe("messageLink", () => {
  it("creates a direct link for a private supergroup", () => {
    expect(messageLink({ chatId: -1001234567890, messageId: 42 }))
      .toBe("https://t.me/c/1234567890/42");
  });

  it("uses the public username when available", () => {
    expect(messageLink({ chatId: -1001234567890, messageId: 42, username: "workshop" }))
      .toBe("https://t.me/workshop/42");
  });
});
