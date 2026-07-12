import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { Effect } from "effect";
import type { IndexRecord, IndexStore } from "./indexing.js";

export interface SearchResult extends IndexRecord {
  readonly createdAt: string;
}

export class SqliteIndexStore implements IndexStore {
  private readonly database: Database.Database;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.database = new Database(path);
    this.database.pragma("journal_mode = WAL");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS indexed_messages (
        plate TEXT NOT NULL,
        chat_id INTEGER NOT NULL DEFAULT 0,
        message_url TEXT NOT NULL,
        message_preview TEXT NOT NULL DEFAULT 'Фото',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(plate, chat_id, message_url)
      );
    `);
    const columns = this.database.prepare("PRAGMA table_info(indexed_messages)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "chat_id")) {
      this.database.exec("ALTER TABLE indexed_messages ADD COLUMN chat_id INTEGER NOT NULL DEFAULT 0");
    }
    if (!columns.some((column) => column.name === "message_preview")) {
      this.database.exec("ALTER TABLE indexed_messages ADD COLUMN message_preview TEXT NOT NULL DEFAULT 'Фото'");
    }
    const legacyRecords = this.database.prepare(`
      SELECT rowid, message_url AS messageUrl
      FROM indexed_messages
      WHERE chat_id = 0
    `).all() as Array<{ rowid: number; messageUrl: string }>;
    const updateLegacyChat = this.database.prepare("UPDATE indexed_messages SET chat_id = ? WHERE rowid = ?");
    for (const record of legacyRecords) {
      const internalId = /^https:\/\/t\.me\/c\/(\d+)\/\d+$/u.exec(record.messageUrl)?.[1];
      if (internalId) updateLegacyChat.run(Number(`-100${internalId}`), record.rowid);
    }
    this.database.exec(`
      CREATE INDEX IF NOT EXISTS indexed_messages_plate_chat
      ON indexed_messages(plate, chat_id);
    `);
  }

  readonly save = (record: IndexRecord): Effect.Effect<void> => Effect.sync(() => {
    this.database.prepare(`
      INSERT INTO indexed_messages (plate, chat_id, message_url, message_preview)
      VALUES (@plate, @chatId, @messageUrl, @messagePreview)
      ON CONFLICT DO NOTHING
    `).run(record);
  });

  readonly find = (plate: string, chatId: number): Effect.Effect<ReadonlyArray<SearchResult>> => Effect.sync(() =>
    this.database.prepare(`
      SELECT plate, chat_id AS chatId, message_url AS messageUrl,
             message_preview AS messagePreview, created_at AS createdAt
      FROM indexed_messages
      WHERE plate = ? AND chat_id = ?
      ORDER BY created_at DESC
    `).all(plate, chatId) as ReadonlyArray<SearchResult>,
  );

  close(): void {
    this.database.close();
  }
}
