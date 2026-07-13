# AGENTS.md — Telegram Car Index Bot

## Mission

This is a privacy-conscious Telegram bot for an auto-service workflow. It analyzes allow-listed Telegram **photo messages** with local Ollama vision, indexes only strictly validated vehicle plates, then links people back to the original Telegram message. It is not a general-purpose surveillance system.

The bot stores only normalized plate data, source-chat scope, Telegram message URL, a compact preview, timestamps, and minimal media metadata. It does **not** persist photos/videos. New photo bytes are held only in memory during local Ollama analysis and are then discarded.

## Repository map

- `src/ollama-vision.ts` — strict local Ollama reader and plate-output validation.
- `src/plate-detector.ts` / `scripts/detect_plate_crops.py` — local YOLO detection and in-memory crop transport.
- `src/detector-crop-analyzer.ts` / `src/recognition-strategy.ts` — configurable `full-image` versus `detector-crop` composition.
- `src/photo-recognition.ts` — temporary in-memory photo processing and shadow/index policy.
- `src/serial-queue.ts` — single-worker recognition queue that protects the Mac from concurrent vision jobs.
- `src/index.ts` — composition root: Telegram handlers, command registration, authorization, and response rendering.
- `src/database.ts` — SQLite schema, additive migrations, and queries.
- `src/plates.ts` — plate normalization and validation, including Ukrainian civilian all-Latin series and four-digit National Police special plates. Supported formats are deliberate product policy.
- `src/car-indexing.ts`, `src/tagged-photo.ts`, `src/indexing.ts` — indexing paths and record shape.
- `src/car-list.ts` — `/list` pagination and callback-data helpers.
- `src/polling.ts` — the single explicit long-poll loop.
- `test/` — Vitest unit and migration tests; maintain a corresponding test for each behavior change.
- `docs/` — architecture and operational runbook.

## Non-negotiable product and privacy rules

1. **Keep records chat-scoped.** Every read and write must preserve `chat_id`; never make `/find` or `/list` search across groups.
2. **Allow-list first.** All handlers and callbacks that read or write data must verify `ALLOWED_CHAT_IDS`.
3. **Do not persist media bytes or full captions.** Photo bytes may exist only in memory for the duration of a local Ollama request. Keep only the existing compact preview policy. Do not add image hosting, user profiles, broad message logging, or cloud image transfer without explicit approval.
4. **Keep secrets local.** Never commit `.env`, bot tokens, SQLite data, logs, or Telegram exports. Revoke a token immediately if it appears in a commit, log, or chat.
5. **Treat recognized plates as untrusted model output.** Normalize and validate every candidate before indexing. Do not loosen formats casually, make unsupported country formats look valid, or index a model explanation/guess.

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
- Only `message:photo` is an indexing input. Captions and text are intentionally ignored. Process the largest `PhotoSize` for each update; Telegram albums arrive as separate messages sharing `media_group_id`.
- Recognition runs through one serial queue and the long-poll loop awaits each photo handler. It will not fetch/process a later update until the active image finishes or times out; do not introduce concurrent inference without measured memory/latency evidence.
- `PHOTO_RECOGNITION_MODE=shadow` must never write model results. Move to `index` only after representative live-photo validation.
- Bot privacy mode and Telegram update delivery can be inconsistent for ordinary media. Verify photo delivery in the target group before diagnosing model accuracy.

## Running and deployment

Local development:

```bash
cp .env.example .env
# Set TELEGRAM_BOT_TOKEN, ALLOWED_CHAT_IDS, and local Ollama settings.
# The default shadow mode measures recognition without writing records.
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
