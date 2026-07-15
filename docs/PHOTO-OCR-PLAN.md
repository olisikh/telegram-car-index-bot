# Automatic Photo Recognition Migration Record

## Status: completed

This document is a short historical record of the completed migration from manual plate tagging to automatic plate recognition. It is **not** an implementation plan and does not define current runtime behavior.

For current behavior, use these documents instead:

- [README.md](../README.md) — user-facing configuration and Telegram setup.
- [ARCHITECTURE.md](ARCHITECTURE.md) — runtime, privacy, and data-flow design.
- [MAINTENANCE.md](MAINTENANCE.md) — deployment, rollout, logs, and recovery.
- [BEGINNER-SETUP.md](BEGINNER-SETUP.md) — non-technical installation on macOS, Windows, and Linux.

## Completed outcome

The bot now:

1. accepts only native Telegram `photo` messages from allow-listed supergroups;
2. downloads the largest Telegram photo size into memory;
3. processes one photo at a time to protect host memory;
4. uses the supported local recognition path:

   ```text
   YOLO plate detector → enlarged in-memory crop → local FastPlateOCR reader
   ```

5. normalizes and strictly validates each candidate before indexing;
6. stores only the validated plate, chat scope, direct message URL, compact preview, media metadata, and timestamp;
7. does not store original photos, crops, captions, general chat text, or raw model responses;
8. always indexes every normalized, validated recognition result;
9. provides chat-scoped `/find`, `/list`, `/verbose`, and `/lang` commands with English-default and Ukrainian replies.

## Constraints retained from the migration

- Source-message links require a Telegram supergroup. A basic group must be migrated, and its new `-100…` ID must be added to `ALLOWED_CHAT_IDS`.
- Group Privacy must be disabled in BotFather. When it is changed after a bot has joined, remove and re-add the bot before photo-delivery testing.
- The bot processes future photos only. It cannot backfill Telegram history.
- Text, photo captions, videos, animations, documents, and files sent as documents are not indexing inputs.
- A model candidate is untrusted until strict plate-format validation succeeds.

## Historical data

Existing index records created before automatic recognition remain searchable. The database migration strategy is additive and preserves historical rows; it does not rewrite or remove them during normal updates.
