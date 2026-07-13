import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { Effect } from "effect";
import type { MediaType } from "./media-label.js";
import type { IndexRecord, IndexStore } from "./indexing.js";

export interface SearchResult extends IndexRecord {
  readonly createdAt: string;
  readonly mediaTypes?: string;
}

export interface MediaGroupMember {
  readonly chatId: number;
  readonly mediaGroupId: string;
  readonly messageId: number;
  readonly mediaType: MediaType;
}

export interface ListedCar {
  readonly plate: string;
  readonly lastSeen: string;
}

export interface CarListPage {
  readonly cars: ReadonlyArray<ListedCar>;
  readonly total: number;
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
        message_preview TEXT NOT NULL DEFAULT 'Мультимедіа',
        media_type TEXT,
        media_group_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(plate, chat_id, message_url)
      );
      CREATE TABLE IF NOT EXISTS media_group_members (
        chat_id INTEGER NOT NULL,
        media_group_id TEXT NOT NULL,
        message_id INTEGER NOT NULL,
        media_type TEXT NOT NULL CHECK (media_type IN ('photo', 'video')),
        PRIMARY KEY (chat_id, media_group_id, message_id)
      );
      CREATE TABLE IF NOT EXISTS chat_recognition_settings (
        chat_id INTEGER PRIMARY KEY,
        verbose INTEGER NOT NULL DEFAULT 0 CHECK (verbose IN (0, 1))
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS plate_fts USING fts5(plate, tokenize='trigram');
    `);
    const columns = this.database.prepare("PRAGMA table_info(indexed_messages)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "chat_id")) {
      this.database.exec("ALTER TABLE indexed_messages ADD COLUMN chat_id INTEGER NOT NULL DEFAULT 0");
    }
    if (!columns.some((column) => column.name === "message_preview")) {
      this.database.exec("ALTER TABLE indexed_messages ADD COLUMN message_preview TEXT NOT NULL DEFAULT 'Мультимедіа'");
    }
    if (!columns.some((column) => column.name === "media_type")) {
      this.database.exec("ALTER TABLE indexed_messages ADD COLUMN media_type TEXT");
    }
    if (!columns.some((column) => column.name === "media_group_id")) {
      this.database.exec("ALTER TABLE indexed_messages ADD COLUMN media_group_id TEXT");
    }
    this.database.prepare("UPDATE indexed_messages SET message_preview = 'Мультимедіа' WHERE message_preview = 'Фото'").run();
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
      CREATE INDEX IF NOT EXISTS indexed_messages_plate_chat_created
      ON indexed_messages(plate, chat_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS media_group_members_group
      ON media_group_members(chat_id, media_group_id);
    `);
  }

  readonly verboseRecognitionEnabled = (chatId: number): Effect.Effect<boolean> => Effect.sync(() => {
    const setting = this.database.prepare(`
      SELECT verbose FROM chat_recognition_settings WHERE chat_id = ?
    `).get(chatId) as { verbose: number } | undefined;
    return setting?.verbose === 1;
  });

  readonly setVerboseRecognition = (chatId: number, enabled: boolean): Effect.Effect<void> => Effect.sync(() => {
    this.database.prepare(`
      INSERT INTO chat_recognition_settings (chat_id, verbose)
      VALUES (?, ?)
      ON CONFLICT(chat_id) DO UPDATE SET verbose = excluded.verbose
    `).run(chatId, enabled ? 1 : 0);
  });

  readonly save = (record: IndexRecord): Effect.Effect<void> => Effect.sync(() => {
    this.database.prepare(`
      INSERT INTO indexed_messages (plate, chat_id, message_url, message_preview, media_type, media_group_id)
      VALUES (@plate, @chatId, @messageUrl, @messagePreview, @mediaType, @mediaGroupId)
      ON CONFLICT DO NOTHING
    `).run({ ...record, mediaType: record.mediaType ?? null, mediaGroupId: record.mediaGroupId ?? null });
    this.database.prepare("INSERT INTO plate_fts (plate) VALUES (?)").run(record.plate);
  });

  readonly recordMediaGroupMember = (member: MediaGroupMember): Effect.Effect<void> => Effect.sync(() => {
    this.database.prepare(`
      INSERT INTO media_group_members (chat_id, media_group_id, message_id, media_type)
      VALUES (@chatId, @mediaGroupId, @messageId, @mediaType)
      ON CONFLICT DO NOTHING
    `).run(member);
  });

  readonly find = (plate: string, chatId: number): Effect.Effect<ReadonlyArray<SearchResult>> => Effect.sync(() =>
    this.database.prepare(`
      SELECT im.plate, im.chat_id AS chatId, im.message_url AS messageUrl,
             im.message_preview AS messagePreview, im.media_type AS mediaType,
             im.media_group_id AS mediaGroupId, im.created_at AS createdAt,
             CASE WHEN im.media_group_id IS NULL THEN im.media_type
               ELSE (
                 SELECT group_concat(DISTINCT member.media_type)
                 FROM media_group_members AS member
                 WHERE member.chat_id = im.chat_id AND member.media_group_id = im.media_group_id
               )
             END AS mediaTypes
      FROM indexed_messages AS im
      WHERE im.plate = ? AND im.chat_id = ?
      ORDER BY im.created_at DESC
    `).all(plate, chatId) as ReadonlyArray<SearchResult>,
  );

  readonly searchPlates = (query: string, chatId: number): Effect.Effect<ReadonlyArray<SearchResult>> => Effect.sync(() => {
    const exact = this.database.prepare(`
      SELECT im.plate, im.chat_id AS chatId, im.message_url AS messageUrl,
             im.message_preview AS messagePreview, im.media_type AS mediaType,
             im.media_group_id AS mediaGroupId, im.created_at AS createdAt,
             CASE WHEN im.media_group_id IS NULL THEN im.media_type
               ELSE (
                 SELECT group_concat(DISTINCT member.media_type)
                 FROM media_group_members AS member
                 WHERE member.chat_id = im.chat_id AND member.media_group_id = im.media_group_id
               )
             END AS mediaTypes
      FROM indexed_messages AS im
      WHERE im.plate = ? AND im.chat_id = ?
      ORDER BY im.created_at DESC
    `).all(query, chatId) as ReadonlyArray<SearchResult>;
    if (exact.length > 0) return exact;

    return this.database.prepare(`
      SELECT im.plate, im.chat_id AS chatId, im.message_url AS messageUrl,
             im.message_preview AS messagePreview, im.media_type AS mediaType,
             im.media_group_id AS mediaGroupId, im.created_at AS createdAt,
             CASE WHEN im.media_group_id IS NULL THEN im.media_type
               ELSE (
                 SELECT group_concat(DISTINCT member.media_type)
                 FROM media_group_members AS member
                 WHERE member.chat_id = im.chat_id AND member.media_group_id = im.media_group_id
               )
             END AS mediaTypes
      FROM indexed_messages AS im
      WHERE im.plate IN (
        SELECT DISTINCT plate FROM plate_fts WHERE plate_fts MATCH ?
      ) AND im.chat_id = ?
      ORDER BY im.created_at DESC
      LIMIT 50
    `).all(query.replace(/"/gu, '""'), chatId) as ReadonlyArray<SearchResult>;
  });

  readonly listCars = (chatId: number, limit: number, offset: number): Effect.Effect<CarListPage> => Effect.sync(() => {
    const total = (this.database.prepare(`
      SELECT COUNT(DISTINCT plate) AS total
      FROM indexed_messages
      WHERE chat_id = ?
    `).get(chatId) as { total: number }).total;
    const cars = this.database.prepare(`
      SELECT plate, MAX(created_at) AS lastSeen
      FROM indexed_messages
      WHERE chat_id = ?
      GROUP BY plate
      ORDER BY lastSeen DESC, plate ASC
      LIMIT ? OFFSET ?
    `).all(chatId, limit, offset) as ReadonlyArray<ListedCar>;
    return { cars, total };
  });

  close(): void {
    this.database.close();
  }
}
