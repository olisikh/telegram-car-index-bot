import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import type { IndexStore } from "../src/indexing.js";
import { processPhotoRecognition } from "../src/photo-recognition.js";

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
    const download = vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]));
    const analyze = vi.fn().mockResolvedValue(["AA1234BB", "KA0001AX"]);

    await expect(processPhotoRecognition({ store, download, analyze, mode: "index" }, photo)).resolves.toEqual([
      "AA1234BB", "KA0001AX",
    ]);
    expect(download).toHaveBeenCalledWith("largest-photo-file");
    expect(analyze).toHaveBeenCalledWith(Uint8Array.from([1, 2, 3]));
    expect(saved).toEqual([
      { plate: "AA1234BB", chatId: -1001234567890, messagePreview: "Фото", mediaType: "photo", messageUrl: "https://t.me/c/1234567890/42" },
      { plate: "KA0001AX", chatId: -1001234567890, messagePreview: "Фото", mediaType: "photo", messageUrl: "https://t.me/c/1234567890/42" },
    ]);
  });

  it("does not write records in shadow mode", async () => {
    const save = vi.fn(() => Effect.void);
    const store: IndexStore = { save };

    await expect(processPhotoRecognition({
      store,
      download: async () => Uint8Array.from([1]),
      analyze: async () => ["AA1234BB"],
      mode: "shadow",
    }, photo)).resolves.toEqual(["AA1234BB"]);
    expect(save).not.toHaveBeenCalled();
  });
});
