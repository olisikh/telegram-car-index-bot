import { Effect } from "effect";
import { describe, expect, it } from "bun:test";
import { indexTaggedMediaReply } from "../src/tagged-photo";
import type { IndexStore } from "../src/indexing";

describe("indexTaggedMediaReply", () => {
  it("indexes the replied-to photo when a text message starts with a plate hashtag", async () => {
    const saved: unknown[] = [];
    const store: IndexStore = { save: (record) => Effect.sync(() => { saved.push(record); }) };

    await Effect.runPromise(indexTaggedMediaReply(store, {
      chatId: -1001234567890,
      mediaMessageId: 41,
      mediaType: "photo",
      text: "#АА1234ВВ готово",
    }));

    expect(saved).toEqual([
      { plate: "AA1234BB", chatId: -1001234567890, messagePreview: "Мультимедіа", mediaType: "photo", messageUrl: "https://t.me/c/1234567890/41" },
    ]);
  });

  it("does not index text where the hashtag is not at the beginning", async () => {
    const saved: unknown[] = [];
    const store: IndexStore = { save: (record) => Effect.sync(() => { saved.push(record); }) };

    await Effect.runPromise(indexTaggedMediaReply(store, {
      chatId: -1001234567890,
      mediaMessageId: 41,
      mediaType: "photo",
      text: "готово #AA1234BB",
    }));

    expect(saved).toEqual([]);
  });
});
