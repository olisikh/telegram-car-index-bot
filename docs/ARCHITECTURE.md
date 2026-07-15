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
  -> SQLite index
  -> chat-scoped /find and /list
```

The Python worker receives base64-encoded source image bytes inside JSON over stdin and returns JSON over stdout. It creates no temporary photo or crop files. YOLO may report more detections, but only the five highest-confidence regions are cropped and sent to OCR.

`src/index.ts` is the runtime composition root. Legacy command/caption indexing helpers that remain elsewhere in `src/` are not registered by the active bot and do not make captions, ordinary text, video, animation, or document updates indexable.

## Commands

| Command | Purpose | Scope |
| --- | --- | --- |
| `/find <plate>` | Show source-photo messages for one plate, or a paginated plate picker for a 3+ character fragment matching several plates. | Current chat only |
| `/list` | Show unique plates, newest first, ten per page. | Current chat only |
| `/verbose on` / `/verbose off` | Toggle per-photo recognition feedback. | Current chat only |
| `/lang en` / `/lang uk` | Persist the reply language; `ua` is accepted as a Ukrainian alias. | Current chat only |
| `/start` | Show brief guidance. | Current allowed chat |

Only native Telegram photo updates are analyzed; captions, text, videos, animations, and documents are ignored.

## Configuration

```dotenv
PHOTO_RECOGNITION_TIMEOUT_MS=60000
PHOTO_RECOGNITION_RECOVERY_ATTEMPTS=2
FAST_PLATE_OCR_MODEL=cct-s-v2-global-model
PLATE_DETECTOR_PYTHON=./.vision-venv/bin/python
PLATE_DETECTOR_SCRIPT=./scripts/detect_and_read_plates.py
PLATE_DETECTOR_MODEL=./models/license-plate-detector.pt
```

Every normalized, validated plate returned by recognition is stored with its chat scope and source-message metadata. `/verbose` changes only chat feedback; it does not control indexing.

English is the default reply language. `src/i18n.ts` provides one typed catalog for English and Ukrainian, including command descriptions, search/list text, media labels, recognition feedback, and duration formatting. `chat_recognition_settings.locale` persists `en` or `uk` independently per chat, and `/lang` installs the corresponding chat-scoped Telegram command menu. Existing databases migrate to `en` without changing their verbose setting or rewriting indexed-message metadata.

`PHOTO_RECOGNITION_RECOVERY_ATTEMPTS` must be `0`, `1`, or `2`; the default is `2`. Recovery starts only when the standard pass reports zero detector boxes. The configured profiles are `standard`, `wide`, and `enhanced`. Recovery succeeds when the enhanced pass shares at least one validated plate with the wide pass; the analyzer then returns the enhanced pass's complete validated list, not only the overlap. The default value `2` is therefore required for a recovery write. If the standard pass reports a detector box but no valid OCR candidate, no recovery profile runs. All enabled passes share one overall timeout.

The detector Python executable, worker script, and detector model must exist at startup.

## Validation and feedback

Candidates must be JSON strings, normalize to a supported plate format, and are deduplicated within a photo. The validator supports Ukraine (including four-digit National Police plates) plus the configured EU civilian formats.

Verbose feedback is per-chat and off by default. It reports safe outcome categories plus detector, crop, and OCR stage durations; it never exposes raw model output, captions, or image bytes.

## Data and privacy

`indexed_messages` stores the normalized plate, chat ID, message URL, limited media metadata, and creation time. `chat_recognition_settings` stores the per-chat verbose flag and locale. SQLite search uses a trigram FTS index over plate values only. No downloaded media or full caption/message body is stored.

Every source record and user-facing search/list operation is scoped by `chat_id`. The FTS table contains distinct normalized plate tokens without message content; every FTS-backed result query joins back to `indexed_messages` and filters by `chat_id`. Source links require a supergroup and are usable only by members who can access the source group.

## Reliability

A serial queue plus awaited long polling applies backpressure: the bot does not request another update until the active image succeeds, times out, or fails. The custom poller requests both `message` and `callback_query` updates for photo processing and inline keyboards.

See [MAINTENANCE.md](MAINTENANCE.md) for deployment and recovery.
