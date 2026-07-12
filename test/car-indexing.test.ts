import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { indexCarMessage } from "../src/car-indexing.js";
import type { IndexStore } from "../src/indexing.js";

describe("indexCarMessage", () => {
  it("indexes a non-photo /car message in its source chat", async () => {
    const saved: Array<{ plate: string; chatId: number; messageUrl: string }> = [];
    const store: IndexStore = { save: (record) => Effect.sync(() => { saved.push(record); }) };

    await Effect.runPromise(indexCarMessage(store, {
      chatId: -1001234567890,
      messageId: 73,
      text: "/car АА1234ВВ maintenance complete",
    }));

    expect(saved).toEqual([
      { plate: "AA1234BB", chatId: -1001234567890, messageUrl: "https://t.me/c/1234567890/73" },
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
