# Architecture

## Purpose and boundaries

The bot keeps a private, chat-scoped vehicle-plate index for allow-listed Telegram supergroups. Its single local recognition path is **YOLO detection → enlarged in-memory crop → FastPlateOCR**. The worker returns untrusted candidate strings; TypeScript normalizes and validates them before any SQLite write.

It is not a message archive, public tracking service, or cloud OCR client.

## Runtime flow

```text
Telegram photo update
  -> explicit getUpdates loop
  -> allow-listed message:photo handler
  -> largest Telegram PhotoSize in memory
  -> one-at-a-time SerialQueue
  -> local Python worker: YOLO detector -> RGB crop(s) -> FastPlateOCR
  -> strict JSON parse, normalization, format validation
  -> shadow observation OR SQLite index
  -> chat-scoped /find and /list
```

The Python worker receives source image bytes over stdin and returns JSON over stdout. It creates no temporary photo or crop files. It detects up to five plate regions per photo.

## Commands

| Command | Purpose | Scope |
| --- | --- | --- |
| `/find <plate>` | Show source-photo messages for one plate, or a paginated plate picker for a 3+ character fragment matching several plates. | Current chat only |
| `/list` | Show unique plates, newest first, ten per page. | Current chat only |
| `/verbose on` / `/verbose off` | Toggle per-photo recognition feedback. | Current chat only |
| `/start` | Show brief guidance. | Current allowed chat |

Only native Telegram photo updates are analyzed; captions, text, videos, animations, and documents are ignored.

## Configuration

```dotenv
PHOTO_RECOGNITION_MODE=shadow
PHOTO_RECOGNITION_TIMEOUT_MS=60000
FAST_PLATE_OCR_MODEL=cct-s-v2-global-model
PLATE_DETECTOR_PYTHON=./.vision-venv/bin/python
PLATE_DETECTOR_SCRIPT=./scripts/detect_and_read_plates.py
PLATE_DETECTOR_MODEL=./models/license-plate-detector.pt
```

`shadow` performs no database writes. `index` stores only normalized, validated plates and source-message metadata. The detector Python executable, script, and detector model are mandatory at startup.

## Validation and feedback

Candidates must be JSON strings, normalize to a supported plate format, and are deduplicated within a photo. The validator supports Ukraine (including four-digit National Police plates) plus the configured EU civilian formats.

Verbose feedback is per-chat and off by default. It reports safe outcome categories plus detector, crop, and OCR stage durations; it never exposes raw model output, captions, or image bytes.

## Data and privacy

`indexed_messages` stores the normalized plate, chat ID, message URL, limited media metadata, and creation time. SQLite search uses a trigram FTS index over plate values only. No downloaded media or full caption/message body is stored.

Every query and write is scoped by `chat_id`. Source links require a supergroup and are usable only by members who can access the source group.

## Reliability

A serial queue plus awaited long polling applies backpressure: the bot does not request another update until the active image succeeds, times out, or fails. The custom poller requests both `message` and `callback_query` updates for photo processing and inline keyboards.

See [MAINTENANCE.md](MAINTENANCE.md) for deployment and recovery.
