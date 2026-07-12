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
        message_url TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(plate, message_url)
      );
      CREATE INDEX IF NOT EXISTS indexed_messages_plate ON indexed_messages(plate);
    `);
  }

  readonly save = (record: IndexRecord): Effect.Effect<void> => Effect.sync(() => {
    this.database.prepare(`
      INSERT INTO indexed_messages (plate, message_url)
      VALUES (@plate, @messageUrl)
      ON CONFLICT(plate, message_url) DO NOTHING
    `).run(record);
  });

  readonly find = (plate: string): Effect.Effect<ReadonlyArray<SearchResult>> => Effect.sync(() =>
    this.database.prepare(`
      SELECT plate, message_url AS messageUrl, created_at AS createdAt
      FROM indexed_messages
      WHERE plate = ?
      ORDER BY created_at DESC
    `).all(plate) as ReadonlyArray<SearchResult>,
  );

  close(): void {
    this.database.close();
  }
}
