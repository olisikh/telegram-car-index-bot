import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { SqliteIndexStore } from "../src/database.js";

describe("SqliteIndexStore", () => {
  it("stores language independently per chat and defaults to English", async () => {
    const store = new SqliteIndexStore(":memory:");
    await expect(Effect.runPromise(store.chatLocale(-100111))).resolves.toBe("en");
    await Effect.runPromise(store.setChatLocale(-100111, "uk"));
    await expect(Effect.runPromise(store.chatLocale(-100111))).resolves.toBe("uk");
    await expect(Effect.runPromise(store.chatLocale(-100222))).resolves.toBe("en");
    await Effect.runPromise(store.setChatLocale(-100111, "en"));
    await expect(Effect.runPromise(store.chatLocale(-100111))).resolves.toBe("en");
    store.close();
  });

  it("migrates existing chat settings to English without losing verbose state", async () => {
    const directory = mkdtempSync(join(tmpdir(), "car-index-settings-"));
    const path = join(directory, "index.db");
    const legacy = new Database(path);
    legacy.exec(`
      CREATE TABLE chat_recognition_settings (
        chat_id INTEGER PRIMARY KEY,
        verbose INTEGER NOT NULL DEFAULT 0 CHECK (verbose IN (0, 1))
      );
      INSERT INTO chat_recognition_settings (chat_id, verbose) VALUES (-100111, 1);
    `);
    legacy.close();

    const store = new SqliteIndexStore(path);
    await expect(Effect.runPromise(store.chatLocale(-100111))).resolves.toBe("en");
    await expect(Effect.runPromise(store.verboseRecognitionEnabled(-100111))).resolves.toBe(true);
    await Effect.runPromise(store.setChatLocale(-100111, "uk"));
    await expect(Effect.runPromise(store.chatLocale(-100111))).resolves.toBe("uk");
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("preserves historical preview metadata during migration", async () => {
    const directory = mkdtempSync(join(tmpdir(), "car-index-preview-"));
    const path = join(directory, "index.db");
    const legacy = new Database(path);
    legacy.exec(`
      CREATE TABLE indexed_messages (
        plate TEXT NOT NULL,
        chat_id INTEGER NOT NULL,
        message_url TEXT NOT NULL,
        message_preview TEXT NOT NULL,
        media_type TEXT,
        media_group_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO indexed_messages (plate, chat_id, message_url, message_preview, media_type)
      VALUES ('AA1234BB', -100111, 'https://t.me/c/111/10', 'Фото', 'photo');
    `);
    legacy.close();

    const store = new SqliteIndexStore(path);
    await expect(Effect.runPromise(store.find("AA1234BB", -100111))).resolves.toMatchObject([
      { messagePreview: "Фото" },
    ]);
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("stores verbose recognition setting independently per chat", async () => {
    const store = new SqliteIndexStore(":memory:");
    await expect(Effect.runPromise(store.verboseRecognitionEnabled(-100111))).resolves.toBe(false);
    await Effect.runPromise(store.setVerboseRecognition(-100111, true));
    await expect(Effect.runPromise(store.verboseRecognitionEnabled(-100111))).resolves.toBe(true);
    await expect(Effect.runPromise(store.verboseRecognitionEnabled(-100222))).resolves.toBe(false);
    await Effect.runPromise(store.setVerboseRecognition(-100111, false));
    await expect(Effect.runPromise(store.verboseRecognitionEnabled(-100111))).resolves.toBe(false);
    store.close();
  });

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
    await expect(Effect.runPromise(store.searchPlateChoices("123", -1001400317169, 10, 0))).resolves.toEqual({
      total: 1,
      plates: ["AA1234BB"],
    });
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("lists unique plates newest first within the requested chat", async () => {
    const directory = mkdtempSync(join(tmpdir(), "car-index-list-"));
    const path = join(directory, "index.db");
    const raw = new Database(path);
    raw.exec(`
      CREATE TABLE indexed_messages (
        plate TEXT NOT NULL, chat_id INTEGER NOT NULL, message_url TEXT NOT NULL,
        message_preview TEXT NOT NULL, created_at TEXT NOT NULL
      );
    `);
    const insert = raw.prepare("INSERT INTO indexed_messages VALUES (?, ?, ?, ?, ?)");
    insert.run("AA1234BB", -100111, "https://t.me/c/111/1", "old", "2026-07-13 10:00:00");
    insert.run("KA0001AX", -100111, "https://t.me/c/111/2", "new", "2026-07-13 12:00:00");
    insert.run("AA1234BB", -100111, "https://t.me/c/111/3", "newest", "2026-07-13 13:00:00");
    insert.run("BB0001BB", -100222, "https://t.me/c/222/1", "other chat", "2026-07-13 14:00:00");
    raw.close();

    const store = new SqliteIndexStore(path);
    await expect(Effect.runPromise(store.listCars(-100111, 10, 0))).resolves.toEqual({
      total: 2,
      cars: [
        { plate: "AA1234BB", lastSeen: "2026-07-13 13:00:00" },
        { plate: "KA0001AX", lastSeen: "2026-07-13 12:00:00" },
      ],
    });
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("aggregates photo and video members of an indexed album", async () => {
    const store = new SqliteIndexStore(":memory:");
    await Effect.runPromise(store.recordMediaGroupMember({
      chatId: -100111, mediaGroupId: "album-1", messageId: 10, mediaType: "photo",
    }));
    await Effect.runPromise(store.recordMediaGroupMember({
      chatId: -100111, mediaGroupId: "album-1", messageId: 11, mediaType: "video",
    }));
    await Effect.runPromise(store.save({
      plate: "AA1234BB", chatId: -100111, messageUrl: "https://t.me/c/111/10",
      messagePreview: "Мультимедіа", mediaType: "photo", mediaGroupId: "album-1",
    }));

    await expect(Effect.runPromise(store.find("AA1234BB", -100111))).resolves.toMatchObject([
      { mediaTypes: "photo,video" },
    ]);
    store.close();
  });

  it("keeps one FTS entry per normalized plate", async () => {
    const directory = mkdtempSync(join(tmpdir(), "car-index-fts-"));
    const path = join(directory, "index.db");
    const store = new SqliteIndexStore(path);
    await Effect.runPromise(store.save({
      plate: "AA1234BB", chatId: -100111, messageUrl: "https://t.me/c/111/1", messagePreview: "",
    }));
    await Effect.runPromise(store.save({
      plate: "AA1234BB", chatId: -100111, messageUrl: "https://t.me/c/111/2", messagePreview: "",
    }));
    store.close();

    const raw = new Database(path, { readonly: true });
    expect((raw.prepare("SELECT COUNT(*) AS total FROM plate_fts WHERE plate = ?").get("AA1234BB") as { total: number }).total).toBe(1);
    raw.close();
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
