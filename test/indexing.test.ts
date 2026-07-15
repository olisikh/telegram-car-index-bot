import { Effect } from "effect";
import { describe, expect, it } from "bun:test";
import { indexPhotoMessage, type IndexStore } from "../src/indexing";

describe("indexPhotoMessage", () => {
  it("indexes every plate in a photo caption with a direct Telegram link", async () => {
    const saved: unknown[] = [];
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
      { plate: "AA1234BB", chatId: -1001234567890, messagePreview: "#car АА1234ВВ; також KA0001AX", mediaType: "photo", messageUrl: "https://t.me/c/1234567890/42" },
      { plate: "KA0001AX", chatId: -1001234567890, messagePreview: "#car АА1234ВВ; також KA0001AX", mediaType: "photo", messageUrl: "https://t.me/c/1234567890/42" },
    ]);
  });
});
