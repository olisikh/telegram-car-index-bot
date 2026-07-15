import { Effect } from "effect";
import { describe, expect, it } from "bun:test";
import { indexCarMessage } from "../src/car-indexing";
import type { IndexStore } from "../src/indexing";

describe("indexCarMessage", () => {
  it("indexes a non-photo /car message in its source chat", async () => {
    const saved: unknown[] = [];
    const store: IndexStore = { save: (record) => Effect.sync(() => { saved.push(record); }) };

    await Effect.runPromise(indexCarMessage(store, {
      chatId: -1001234567890,
      messageId: 73,
      text: "/car АА1234ВВ maintenance complete",
      mediaType: "photo",
    }));

    expect(saved).toEqual([
      { plate: "AA1234BB", chatId: -1001234567890, messagePreview: "maintenance complete", mediaType: "photo", messageUrl: "https://t.me/c/1234567890/73" },
    ]);
  });

  it("does not index an invalid /car message", async () => {
    const saved: unknown[] = [];
    const store: IndexStore = { save: (record) => Effect.sync(() => { saved.push(record); }) };

    await Effect.runPromise(indexCarMessage(store, {
      chatId: -1001234567890,
      messageId: 74,
      text: "/car hello AA1234BB",
    }));

    expect(saved).toEqual([]);
  });
});
