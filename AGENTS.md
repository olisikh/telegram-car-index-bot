# AGENTS.md — Telegram Car Index Bot

## Mission

This is a privacy-conscious Telegram bot for an auto-service workflow. It indexes a vehicle plate explicitly supplied with `/car`, then links people back to the original Telegram message. It is **not** a general-purpose surveillance or OCR system.

The bot stores only normalized plate data, source-chat scope, Telegram message URL, a compact preview, timestamps, and minimal media metadata. It does **not** download or retain photos/videos.

## Repository map

- `src/index.ts` — composition root: Telegram handlers, command registration, authorization, and response rendering.
- `src/database.ts` — SQLite schema, additive migrations, and queries.
- `src/plates.ts` — plate normalization and validation. Supported formats are deliberate product policy.
- `src/car-indexing.ts`, `src/tagged-photo.ts`, `src/indexing.ts` — indexing paths and record shape.
- `src/car-list.ts` — `/list` pagination and callback-data helpers.
- `src/polling.ts` — the single explicit long-poll loop.
- `test/` — Vitest unit and migration tests; maintain a corresponding test for each behavior change.
- `docs/` — architecture and operational runbook.

## Non-negotiable product and privacy rules

1. **Keep records chat-scoped.** Every read and write must preserve `chat_id`; never make `/find` or `/list` search across groups.
2. **Allow-list first.** All handlers and callbacks that read or write data must verify `ALLOWED_CHAT_IDS`.
3. **Do not store media bytes or full captions.** Keep only the existing compact preview policy. Do not add image hosting, user profiles, or broad message logging without explicit approval.
4. **Keep secrets local.** Never commit `.env`, bot tokens, SQLite data, logs, or Telegram exports. Revoke a token immediately if it appears in a commit, log, or chat.
5. **Treat a plate as user-provided data.** Preserve validation; do not loosen it casually or make unsupported country formats look valid.

## Development workflow

Use TypeScript in strict mode and ESM imports with the `.js` suffix. The project intentionally uses `effect` for persistence effects; retain that boundary instead of adding ad-hoc async database access.

For any behavior change:

1. Add or update a focused test first.
2. Implement the smallest change that makes it pass.
3. Run the full verification suite:

   ```bash
   npm test
   npm run typecheck
   npm run lint
   ```

4. Update `README.md` for user-visible behavior and `docs/` for operational/design changes.
5. Commit a focused change. Do not combine unrelated refactors, generated files, or data files.

## SQLite changes

`SqliteIndexStore` opens existing production databases, so schema changes must be backward compatible:

- Prefer additive nullable columns, new tables, and `CREATE INDEX IF NOT EXISTS`.
- Detect legacy columns using `PRAGMA table_info` before `ALTER TABLE`.
- Make migrations idempotent and test them with an old schema fixture.
- Do not drop/rebuild production tables or mutate historical data without an approved backup and migration plan.
- Keep the uniqueness rule `(plate, chat_id, message_url)` unless requirements explicitly change.

## Telegram-specific traps

- The bot uses a custom `getUpdates` loop; it must be the **only** active poller for the token.
- Every interaction type must be listed in `allowedUpdates`. Inline-keyboard buttons require `callback_query`; omitting it makes `/list` appear correct while its buttons do nothing.
- Register user-facing commands in `src/commands.ts`; startup publishes that list through `setMyCommands`.
- Always call `answerCallbackQuery` for a button press. `/list` pagination edits the list message; selecting a plate deletes that widget and sends the normal scoped search result.
- Telegram may deliver a video as `video`, `animation`, or a `document` with a `video/*` MIME type. Preserve the shared media-classification path.
- Bot privacy mode and Telegram update delivery can be inconsistent for ordinary media. `/car <plate>` commands are the primary reliable indexing path.

## Running and deployment

Local development:

```bash
cp .env.example .env
# Set TELEGRAM_BOT_TOKEN and ALLOWED_CHAT_IDS.
npm install
npm run dev
```

The current production host runs one macOS LaunchAgent named `com.olisikh.bandera-car-index-bot`; see `docs/MAINTENANCE.md`. Do not start `npm start` alongside the agent—two pollers cause Telegram `409 Conflict` errors.

## Before declaring work complete

Confirm all of the following:

- Tests, typecheck, and lint pass.
- The agent is running after a production change.
- Sensitive files remain untracked.
- Any new command is registered, authorized, and tested.
- Any database change has a forward-compatible migration and test.
