import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { Effect } from "effect";
import { DEFAULT_LOCALE, type Locale } from "./i18n";
import type { MediaType } from "./media-label";
import type { IndexRecord, IndexStore } from "./indexing";

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

export interface PlateChoicePage {
  readonly plates: ReadonlyArray<string>;
  readonly total: number;
}

export class SqliteIndexStore implements IndexStore {
  private readonly database: Database;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.database = new Database(path);
    this.database.exec("PRAGMA journal_mode = WAL");
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
        verbose INTEGER NOT NULL DEFAULT 0 CHECK (verbose IN (0, 1)),
        locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'uk'))
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS plate_fts USING fts5(plate, tokenize='trigram');
    `);
    const columns = this.database.query("PRAGMA table_info(indexed_messages)").all() as Array<{ name: string }>;
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
    const settingsColumns = this.database.query("PRAGMA table_info(chat_recognition_settings)").all() as Array<{ name: string }>;
    if (!settingsColumns.some((column) => column.name === "locale")) {
      this.database.exec("ALTER TABLE chat_recognition_settings ADD COLUMN locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'uk'))");
    }
    const legacyRecords = this.database.query(`
      SELECT rowid, message_url AS messageUrl
      FROM indexed_messages
      WHERE chat_id = 0
    `).all() as Array<{ rowid: number; messageUrl: string }>;
    const updateLegacyChat = this.database.query("UPDATE indexed_messages SET chat_id = ? WHERE rowid = ?");
    for (const record of legacyRecords) {
      const internalId = /^https:\/\/t\.me\/c\/(\d+)\/\d+$/u.exec(record.messageUrl)?.[1];
      if (internalId) updateLegacyChat.run(Number(`-100${internalId}`), record.rowid);
    }
    this.database.exec(`
      INSERT INTO plate_fts (plate)
      SELECT DISTINCT im.plate
      FROM indexed_messages AS im
      WHERE NOT EXISTS (
        SELECT 1 FROM plate_fts AS fts WHERE fts.plate = im.plate
      );
    `);
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
    const setting = this.database.query(`
      SELECT verbose FROM chat_recognition_settings WHERE chat_id = ?
    `).get(chatId) as { verbose: number } | null | undefined;
    return setting?.verbose === 1;
  });

  readonly setVerboseRecognition = (chatId: number, enabled: boolean): Effect.Effect<void> => Effect.sync(() => {
    this.database.query(`
      INSERT INTO chat_recognition_settings (chat_id, verbose)
      VALUES (?, ?)
      ON CONFLICT(chat_id) DO UPDATE SET verbose = excluded.verbose
    `).run(chatId, enabled ? 1 : 0);
  });

  readonly chatLocale = (chatId: number): Effect.Effect<Locale> => Effect.sync(() => {
    const setting = this.database.query(`
      SELECT locale FROM chat_recognition_settings WHERE chat_id = ?
    `).get(chatId) as { locale: string } | null | undefined;
    return setting?.locale === "uk" ? "uk" : DEFAULT_LOCALE;
  });

  readonly setChatLocale = (chatId: number, locale: Locale): Effect.Effect<void> => Effect.sync(() => {
    this.database.query(`
      INSERT INTO chat_recognition_settings (chat_id, locale)
      VALUES (?, ?)
      ON CONFLICT(chat_id) DO UPDATE SET locale = excluded.locale
    `).run(chatId, locale);
  });

  readonly save = (record: IndexRecord): Effect.Effect<void> => Effect.sync(() => {
    const insert = this.database.query(`
      INSERT INTO indexed_messages (plate, chat_id, message_url, message_preview, media_type, media_group_id)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT DO NOTHING
    `).run(record.plate, record.chatId, record.messageUrl, record.messagePreview, record.mediaType ?? null, record.mediaGroupId ?? null);
    if (insert.changes > 0) {
      this.database.query(`
        INSERT INTO plate_fts (plate)
        SELECT ?
        WHERE NOT EXISTS (SELECT 1 FROM plate_fts WHERE plate = ?)
      `).run(record.plate, record.plate);
    }
  });

  readonly recordMediaGroupMember = (member: MediaGroupMember): Effect.Effect<void> => Effect.sync(() => {
    this.database.query(`
      INSERT INTO media_group_members (chat_id, media_group_id, message_id, media_type)
      VALUES (?, ?, ?, ?)
      ON CONFLICT DO NOTHING
    `).run(member.chatId, member.mediaGroupId, member.messageId, member.mediaType);
  });

  readonly find = (plate: string, chatId: number): Effect.Effect<ReadonlyArray<SearchResult>> => Effect.sync(() =>
    this.database.query(`
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
    const exact = this.database.query(`
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

    return this.database.query(`
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

  readonly searchPlateChoices = (query: string, chatId: number, limit: number, offset: number): Effect.Effect<PlateChoicePage> => Effect.sync(() => {
    const ftsQuery = query.replace(/"/gu, '""');
    const total = (this.database.query(`
      SELECT COUNT(DISTINCT im.plate) AS total
      FROM indexed_messages AS im
      WHERE im.chat_id = ? AND im.plate IN (
        SELECT DISTINCT plate FROM plate_fts WHERE plate_fts MATCH ?
      )
    `).get(chatId, ftsQuery) as { total: number }).total;
    const plates = this.database.query(`
      SELECT im.plate
      FROM indexed_messages AS im
      WHERE im.chat_id = ? AND im.plate IN (
        SELECT DISTINCT plate FROM plate_fts WHERE plate_fts MATCH ?
      )
      GROUP BY im.plate
      ORDER BY MAX(im.created_at) DESC, im.plate ASC
      LIMIT ? OFFSET ?
    `).all(chatId, ftsQuery, limit, offset) as ReadonlyArray<{ plate: string }>;
    return { total, plates: plates.map(({ plate }) => plate) };
  });

  readonly listCars = (chatId: number, limit: number, offset: number): Effect.Effect<CarListPage> => Effect.sync(() => {
    const total = (this.database.query(`
      SELECT COUNT(DISTINCT plate) AS total
      FROM indexed_messages
      WHERE chat_id = ?
    `).get(chatId) as { total: number }).total;
    const cars = this.database.query(`
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
