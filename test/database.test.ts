import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { SqliteIndexStore } from "../src/database.js";

describe("SqliteIndexStore", () => {
  it("returns a plate only from the requested chat", async () => {
    const store = new SqliteIndexStore(":memory:");
    await Effect.runPromise(store.save({
      plate: "AA1234BB", chatId: -100111, messageUrl: "https://t.me/c/111/42",
    }));
    await Effect.runPromise(store.save({
      plate: "AA1234BB", chatId: -100222, messageUrl: "https://t.me/c/222/99",
    }));

    await expect(Effect.runPromise(store.find("AA1234BB", -100111))).resolves.toMatchObject([
      { plate: "AA1234BB", chatId: -100111, messageUrl: "https://t.me/c/111/42" },
    ]);
    await expect(Effect.runPromise(store.find("AA1234BB", -100222))).resolves.toMatchObject([
      { plate: "AA1234BB", chatId: -100222, messageUrl: "https://t.me/c/222/99" },
    ]);
    store.close();
  });

  it("creates the directory for a file-backed index", () => {
    const directory = mkdtempSync(join(tmpdir(), "car-index-"));
    const path = join(directory, "nested", "index.db");
    const store = new SqliteIndexStore(path);
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
});
