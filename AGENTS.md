# AGENTS.md — Telegram Car Index Bot

## Mission

A privacy-conscious Telegram bot for auto-service workflows. It processes allow-listed Telegram **photo messages** through one local pipeline: **YOLO plate detector → in-memory crop → FastPlateOCR**. It indexes only strictly validated plates and links users back to the source message.

The active runtime stores normalized plate data, source-chat scope, message URL, timestamps, and limited media metadata. It does not persist source photos, crops, full captions, or general chat text.

## Repository map

- `src/index.ts` — Telegram composition root, allow-list, commands, and queue.
- `scripts/detect_and_read_plates.py` — the single in-memory YOLO + FastPlateOCR worker.
- `src/fast-plate-ocr-analyzer.ts` — bounded Python-worker adapter.
- `src/plate-analyzer.ts` / `src/recognized-plates.ts` — analyzer contract and strict candidate parsing.
- `src/photo-recognition.ts` — in-memory processing and unconditional indexing of validated plates.
- `src/plates.ts` — normalization and supported-country validation.
- `src/database.ts` — SQLite schema, FTS plate search, and chat-scoped queries.
- `src/car-list.ts`, `src/find-query.ts`, `src/find-results.ts` — search/list interaction helpers.
- `test/` — Vitest unit and migration tests.

## Non-negotiable rules

1. Every source record and user-facing result must retain and filter by `chat_id`. The plate-only FTS vocabulary may be global, but every FTS-backed result query must join to chat-scoped records.
2. Check `ALLOWED_CHAT_IDS` in every handler and callback.
3. Do not persist media bytes, captions, Telegram exports, or raw reader output.
4. Keep `.env`, SQLite data, logs, and tokens out of Git.
5. Treat FastPlateOCR output as untrusted; normalize and validate every candidate before indexing.
6. The only recognition path is local YOLO → FastPlateOCR. Do not add strategy switches, Ollama readers, cloud OCR, or fallback paths without explicit user direction.
7. The recognition worker runs serially and Telegram polling waits for it. Do not introduce parallel inference without a measured resource plan.
8. Supergroups are required for durable clickable source links.
9. Treat `src/index.ts` as the runtime source of truth. Legacy helper modules and tests for command, caption, tag, video, or document indexing are not wired into the active bot.

## Configuration

Native-host startup requires these repository-local files at their default paths:

```text
.vision-venv/bin/python
scripts/detect_and_read_plates.py
models/license-plate-detector.pt
```

The Docker image supplies equivalent files at `/opt/venv/bin/python`, `/app/scripts/detect_and_read_plates.py`, and `/app/models/license-plate-detector.pt`.

Core variables:

```dotenv
PHOTO_RECOGNITION_TIMEOUT_MS=60000
PHOTO_RECOGNITION_RECOVERY_ATTEMPTS=0|1|2
FAST_PLATE_OCR_MODEL=cct-s-v2-global-model
```

## Development and deployment

Use strict TypeScript with `.js` ESM imports and preserve the Effect persistence boundary. For every behavior change, use TDD, update user/operational docs, then run:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

The macOS production service is `com.olisikh.bandera-car-index-bot`. Never run a second manual poller alongside it. After deployment, verify the agent is running and its startup log reports `pipeline=detector-fast-ocr`.

SQLite migrations must be additive and idempotent. Do not drop/rebuild production tables or mutate historical data without an approved backup/migration plan.
