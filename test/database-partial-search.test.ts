import { describe, expect, it } from "vitest";
import { SqliteIndexStore } from "../src/database.js";
import { Effect } from "effect";

describe("SqliteIndexStore partial plate search", () => {
  it("finds plates by a 3-character substring", async () => {
    const store = new SqliteIndexStore(":memory:");
    await Effect.runPromise(store.save({
      plate: "AX6537HT", chatId: -100111, messageUrl: "https://t.me/c/111/1", messagePreview: "",
    }));
    await Effect.runPromise(store.save({
      plate: "BE6532AA", chatId: -100111, messageUrl: "https://t.me/c/111/2", messagePreview: "",
    }));
    await Effect.runPromise(store.save({
      plate: "AA1234BB", chatId: -100111, messageUrl: "https://t.me/c/111/3", messagePreview: "",
    }));

    const results = await Effect.runPromise(store.searchPlates("653", -100111));

    expect(results.map((record) => record.plate)).toEqual(["AX6537HT", "BE6532AA"]);
  });

  it("returns only exact match when the query is a full valid plate", async () => {
    const store = new SqliteIndexStore(":memory:");
    await Effect.runPromise(store.save({
      plate: "AX6537HT", chatId: -100111, messageUrl: "https://t.me/c/111/1", messagePreview: "",
    }));
    await Effect.runPromise(store.save({
      plate: "BE6532AA", chatId: -100111, messageUrl: "https://t.me/c/111/2", messagePreview: "",
    }));

    const results = await Effect.runPromise(store.searchPlates("AX6537HT", -100111));

    expect(results.map((record) => record.plate)).toEqual(["AX6537HT"]);
  });

  it("scopes partial search to the same chat", async () => {
    const store = new SqliteIndexStore(":memory:");
    await Effect.runPromise(store.save({
      plate: "AX6537HT", chatId: -100111, messageUrl: "https://t.me/c/111/1", messagePreview: "",
    }));
    await Effect.runPromise(store.save({
      plate: "BE6532AA", chatId: -100222, messageUrl: "https://t.me/c/222/2", messagePreview: "",
    }));

    const results = await Effect.runPromise(store.searchPlates("653", -100222));

    expect(results.map((record) => record.plate)).toEqual(["BE6532AA"]);
  });

  it("limits broad partial results to 50 records", async () => {
    const store = new SqliteIndexStore(":memory:");
    for (let index = 0; index < 55; index++) {
      await Effect.runPromise(store.save({
        plate: `AX${String(index).padStart(4, "0")}BB`,
        chatId: -100111,
        messageUrl: `https://t.me/c/111/${index}`,
        messagePreview: "",
      }));
    }

    const results = await Effect.runPromise(store.searchPlates("AX00", -100111));

    expect(results.length).toBe(50);
  });

  it("still uses mediaTypes aggregation for partial matches", async () => {
    const store = new SqliteIndexStore(":memory:");
    await Effect.runPromise(store.save({
      plate: "AX6537HT", chatId: -100111, messageUrl: "https://t.me/c/111/10",
      messagePreview: "", mediaType: "photo", mediaGroupId: "album-1",
    }));
    await Effect.runPromise(store.recordMediaGroupMember({
      chatId: -100111, mediaGroupId: "album-1", messageId: 10, mediaType: "photo",
    }));
    await Effect.runPromise(store.recordMediaGroupMember({
      chatId: -100111, mediaGroupId: "album-1", messageId: 11, mediaType: "video",
    }));

    const results = await Effect.runPromise(store.searchPlates("653", -100111));

    expect(results[0]?.mediaTypes).toBe("photo,video");
  });
});
