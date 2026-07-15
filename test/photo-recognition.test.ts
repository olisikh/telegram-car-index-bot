import { Effect } from "effect";
import { describe, expect, it, mock } from "bun:test";
import type { IndexStore } from "../src/indexing";
import { processPhotoRecognition } from "../src/photo-recognition";

describe("processPhotoRecognition", () => {
  const photo = {
    chatId: -1001234567890,
    messageId: 42,
    fileId: "largest-photo-file",
    chatUsername: undefined,
  };

  it("downloads, analyzes, and indexes every valid recognized plate", async () => {
    const saved: unknown[] = [];
    const store: IndexStore = { save: (record) => Effect.sync(() => { saved.push(record); }) };
    const download = mock().mockResolvedValue(Uint8Array.from([1, 2, 3]));
    const analyze = mock().mockResolvedValue(["AA1234BB", "KA0001AX"]);

    await expect(processPhotoRecognition({ store, download, analyze }, photo)).resolves.toEqual({
      plates: ["AA1234BB", "KA0001AX"],
      timings: {},
    });
    expect(download).toHaveBeenCalledWith("largest-photo-file");
    expect(analyze).toHaveBeenCalledWith(Uint8Array.from([1, 2, 3]));
    expect(saved).toEqual([
      { plate: "AA1234BB", chatId: -1001234567890, messagePreview: "Фото", mediaType: "photo", messageUrl: "https://t.me/c/1234567890/42" },
      { plate: "KA0001AX", chatId: -1001234567890, messagePreview: "Фото", mediaType: "photo", messageUrl: "https://t.me/c/1234567890/42" },
    ]);
  });
});
