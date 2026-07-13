# Architecture

## Purpose and boundaries

The bot maintains a private, chat-scoped vehicle-plate index for allow-listed Telegram **supergroups**. It analyzes incoming photo messages through the production local recognition path: YOLO detection followed by cropped-plate reading with local Qwen. Flow 3 adds an optional local FastPlateOCR reader after the same detector/crop step for lightweight cross-platform evaluation. The legacy full-image Ollama strategy remains only for controlled diagnostic comparison or rollback. A plate is saved only after the active reader returns a strict candidate and the TypeScript application normalizes and validates it.

The bot is not a general message archive, OCR crawler, or public vehicle-tracking service.

## Runtime flow

```text
Telegram photo update
  -> explicit getUpdates loop (`src/polling.ts`)
  -> allow-listed `message:photo` handler (`src/index.ts`)
  -> largest Telegram PhotoSize downloaded into memory
  -> one-at-a-time queue (`src/serial-queue.ts`)
  -> recognition strategy (`detector-crop`: local detector → in-memory crop(s) → Qwen; `detector-fast-ocr`: local detector → in-memory crop(s) → FastPlateOCR; `full-image`: diagnostic fallback)
  -> JSON parse, plate normalization, and format validation
  -> shadow observation OR SQLite index (`src/photo-recognition.ts`)
  -> `/find` and `/list` retrieve links from SQLite
```

The custom poller requests both `message` and `callback_query` updates. Callback queries are required for `/list` plate buttons and pagination.

## Commands

| Command | Purpose | Scope |
| --- | --- | --- |
| `/find <plate>` | Return links to indexed photo messages for one plate or a 3+ character plate fragment. | Current chat only |

The command menu contains `/find`, `/list`, and `/verbose`; no manual indexing command is registered.
| `/list` | Show unique plates, newest mention first, ten per page. | Current chat only |
| `/verbose on` / `/verbose off` | Enable or disable per-photo recognition feedback in the current chat. | Current chat only |
| `/start` | Show brief automatic-photo-indexing guidance. | Current allowed chat |

The bot has no manual plate-tagging command. Only native Telegram `message:photo` updates are indexing inputs; photo captions are ignored, and text, videos, animations, and documents are not processed.

## Recognition strategies

| Strategy | Flow | Notes |
| --- | --- | --- |
| `full-image` | Original photo → local Ollama | Legacy diagnostic fallback; not selected for a new deployment. |
| `detector-crop` | Original photo → `scripts/detect_plate_crops.py` → up to five enlarged JPEG crops → local `qwen2.5vl:7b` | Supported production path for smaller/distant plates. |
| `detector-fast-ocr` | Original photo → `scripts/detect_plate_crops.py` → up to five enlarged crops → FastPlateOCR CCT-S v2 ONNX reader | Flow 3 lightweight candidate; keep in shadow mode until a representative benchmark passes. |

Both detector strategies invoke the local YOLO detector through stdin/stdout. `detector-crop` returns in-memory JPEG crops to the TypeScript Ollama adapter; `detector-fast-ocr` reads those crops inside the same Python invocation and returns candidate strings. Source photos and generated crops exist only in memory; no temporary media files are created. The detector script/model/Python environment are validated at startup whenever either detector strategy is selected.

## Ollama recognition contract

`OllamaVisionAnalyzer` sends one photo and requires JSON shaped as:

```json
{"plates":["AA1234BB"]}
```

The response is untrusted. The bot accepts a candidate only after it:

1. is a string in the `plates` array;
2. has visual whitespace/hyphens removed;
3. has Ukrainian/Latin lookalikes normalized;
4. matches a supported plate format, including four-digit Ukrainian National Police blue plates;
5. is deduplicated within that photo.

When the general pass finds no plate, the local analyzer performs one additional, time-bounded pass specifically for visibly confirmed Ukrainian National Police markings/blue plates. Both passes share the configured overall timeout.

Photo bytes are passed from Telegram directly to Ollama in memory as base64 and are not written to disk. The default `OLLAMA_BASE_URL` is `127.0.0.1`; using a remote endpoint changes the privacy model because it transfers source images externally.

## Recognition modes

| Mode | SQLite writes | Purpose |
| --- | --- | --- |
| `shadow` | None | Measure live recognition quality without polluting the index. |
| `index` | Validated recognized plates only | Production automatic indexing. |

The default new-install configuration is `shadow` mode with the detector-crop/Qwen path. Change to `index` only after representative live images have been evaluated.

## Recognition feedback

Verbose status is stored per chat in `chat_recognition_settings` and defaults to off. An allowed-chat user controls it in the target chat:

```text
/verbose on
/verbose off
```

When enabled, each completion reply contains a direct source-photo link, recognized plate(s) where available, the outcome (no plate, timeout, or crash), and elapsed time. Detector strategies additionally show `🕵️‍♂️ Пошук` (detection), `✂️ Обрізання` (crop preparation), and `👁️ OCR` (reader) stage durations. It intentionally does not disclose raw model output or internal exception data.

## Queue and reliability model

A `SerialQueue` processes one recognition job at a time. This is intentional: the installed local vision models and detector run on a host with 16 GB RAM. Incoming updates remain queued at Telegram while a recognition job runs. The long-poll loop awaits each `bot.handleUpdate`, so the bot does not request or process a later update until the active photo has completed or timed out.

If Telegram download, Ollama inference, JSON parsing, or validation fails, that photo is not indexed. The bot logs only safe operational metadata such as chat/message identifiers, candidate count, mode, and error class/message—not caption text, image bytes, or model response body.

Telegram albums are separate photo messages with a shared `media_group_id`; every image is processed independently and receives its own Telegram message URL.

## Data model

### `indexed_messages`

| Field | Meaning |
| --- | --- |
| `plate` | Validated, normalized plate token |
| `chat_id` | Telegram chat scope; mandatory for isolation |
| `message_url` | Direct Telegram message link |
| `message_preview` | Legacy compact metadata retained for existing records; it is not shown in current `/find` results |
| `media_type` | `photo` for new automatic records |
| `media_group_id` | Telegram album identifier, when applicable |
| `created_at` | UTC database creation timestamp; `/find` renders it as `DD.MM.YYYY HH:MM` in `Europe/Kyiv` |

Uniqueness is `(plate, chat_id, message_url)`: the same photo cannot create duplicate index rows for the same plate.

### `media_group_members`

This table remains for legacy media records. New automatic photo recognition does not depend on mixed-media album inference.

## Privacy and access model

- `ALLOWED_CHAT_IDS` is required at startup and checked in every data-bearing handler.
- Source-message links require a supergroup; a legacy/basic group must be migrated and its replacement `-100…` ID added to the allow-list.
- Reads and writes are scoped to the originating `chat_id`.
- The database contains no downloaded Telegram media and no full message/caption bodies.
- Message URLs are useful only to Telegram users who already have source-group access.
- Do not configure a cloud endpoint without explicit approval from the data owner and people whose images are processed.

See [MAINTENANCE.md](MAINTENANCE.md) for deployment, shadow-mode validation, backup, and incident procedures.
