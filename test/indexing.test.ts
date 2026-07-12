import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { indexPhotoMessage, type IndexStore } from "../src/indexing.js";

describe("indexPhotoMessage", () => {
  it("indexes every plate in a photo caption with a direct Telegram link", async () => {
    const saved: Array<{ plate: string; chatId: number; messageUrl: string }> = [];
    const store: IndexStore = {
      save: (record) => Effect.sync(() => { saved.push(record); }),
    };

    await Effect.runPromise(indexPhotoMessage(store, {
      chatId: -1001234567890,
      messageId: 42,
      chatUsername: undefined,
      caption: "#car АА1234ВВ; також KA0001AX",
    }));

    expect(saved).toEqual([
      { plate: "AA1234BB", chatId: -1001234567890, messageUrl: "https://t.me/c/1234567890/42" },
      { plate: "KA0001AX", chatId: -1001234567890, messageUrl: "https://t.me/c/1234567890/42" },
    ]);
  });
});
