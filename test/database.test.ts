import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { SqliteIndexStore } from "../src/database.js";

describe("SqliteIndexStore", () => {
  it("returns a plate only from the requested chat", async () => {
    const store = new SqliteIndexStore(":memory:");
    await Effect.runPromise(store.save({
      plate: "AA1234BB", chatId: -100111, messageUrl: "https://t.me/c/111/42", messagePreview: "first service",
    }));
    await Effect.runPromise(store.save({
      plate: "AA1234BB", chatId: -100222, messageUrl: "https://t.me/c/222/99", messagePreview: "second service",
    }));

    await expect(Effect.runPromise(store.find("AA1234BB", -100111))).resolves.toMatchObject([
      { plate: "AA1234BB", chatId: -100111, messageUrl: "https://t.me/c/111/42" },
    ]);
    await expect(Effect.runPromise(store.find("AA1234BB", -100222))).resolves.toMatchObject([
      { plate: "AA1234BB", chatId: -100222, messageUrl: "https://t.me/c/222/99" },
    ]);
    store.close();
  });

  it("backfills chat IDs from legacy private-group message URLs", async () => {
    const directory = mkdtempSync(join(tmpdir(), "car-index-legacy-"));
    const path = join(directory, "index.db");
    const legacy = new Database(path);
    legacy.exec(`
      CREATE TABLE indexed_messages (
        plate TEXT NOT NULL,
        message_url TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(plate, message_url)
      );
    `);
    legacy.prepare("INSERT INTO indexed_messages (plate, message_url) VALUES (?, ?)")
      .run("AA1234BB", "https://t.me/c/1400317169/46373");
    legacy.close();

    const store = new SqliteIndexStore(path);
    await expect(Effect.runPromise(store.find("AA1234BB", -1001400317169))).resolves.toMatchObject([
      { messagePreview: "Мультимедіа" },
    ]);
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("creates the directory for a file-backed index", () => {
    const directory = mkdtempSync(join(tmpdir(), "car-index-"));
    const path = join(directory, "nested", "index.db");
    const store = new SqliteIndexStore(path);
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
});
