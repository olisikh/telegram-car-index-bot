import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { indexTaggedPhotoReply } from "../src/tagged-photo.js";
import type { IndexStore } from "../src/indexing.js";

describe("indexTaggedPhotoReply", () => {
  it("indexes the replied-to photo when a text message starts with a plate hashtag", async () => {
    const saved: Array<{ plate: string; messageUrl: string }> = [];
    const store: IndexStore = { save: (record) => Effect.sync(() => { saved.push(record); }) };

    await Effect.runPromise(indexTaggedPhotoReply(store, {
      chatId: -1001234567890,
      photoMessageId: 41,
      text: "#АА1234ВВ готово",
    }));

    expect(saved).toEqual([
      { plate: "AA1234BB", messageUrl: "https://t.me/c/1234567890/41" },
    ]);
  });

  it("does not index text where the hashtag is not at the beginning", async () => {
    const saved: unknown[] = [];
    const store: IndexStore = { save: (record) => Effect.sync(() => { saved.push(record); }) };

    await Effect.runPromise(indexTaggedPhotoReply(store, {
      chatId: -1001234567890,
      photoMessageId: 41,
      text: "готово #AA1234BB",
    }));

    expect(saved).toEqual([]);
  });
});
