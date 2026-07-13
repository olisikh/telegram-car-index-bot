# Architecture

## Purpose and boundaries

The bot maintains a private, chat-scoped vehicle-plate index for an auto-service Telegram group. It analyzes incoming **photo messages only** with a configured local Ollama vision model. A plate is saved only after the model returns a strict candidate and the TypeScript application normalizes and validates it.

The bot is not a general message archive, OCR crawler, or public vehicle-tracking service.

## Runtime flow

```text
Telegram photo update
  -> explicit getUpdates loop (`src/polling.ts`)
  -> allow-listed `message:photo` handler (`src/index.ts`)
  -> largest Telegram PhotoSize downloaded into memory
  -> one-at-a-time queue (`src/serial-queue.ts`)
  -> local Ollama vision request (`src/ollama-vision.ts`)
  -> JSON parse, plate normalization, and format validation
  -> shadow observation OR SQLite index (`src/photo-recognition.ts`)
  -> `/find` and `/list` retrieve links from SQLite
```

The custom poller requests both `message` and `callback_query` updates. Callback queries are required for `/list` plate buttons and pagination.

## Commands

| Command | Purpose | Scope |
| --- | --- | --- |
| `/find <plate>` | Return links to indexed photo messages for one plate. | Current chat only |
| `/list` | Show unique plates, newest mention first, ten per page. | Current chat only |
| `/start` | Show brief automatic-photo-indexing guidance. | Current allowed chat |

There is deliberately no `/car` command. Text, captions, videos, animations, and documents are not indexing inputs.

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

The default is `shadow`. Change to `index` only after representative live images have been evaluated.

## Recognition feedback

Verbose status is stored per chat in `chat_recognition_settings` and defaults to off. An allowed-chat user controls it in the target chat:

```text
/verbose on
/verbose off
```

When enabled, each completion reply contains a direct source-photo link, recognized plate(s) where available, the outcome (no plate, timeout, or crash), and elapsed time. It intentionally does not disclose raw model output or internal exception data.

## Queue and reliability model

A `SerialQueue` processes one recognition job at a time. This is intentional: the installed local vision model is approximately 9.6 GB and the host has 16 GB RAM. Incoming updates remain queued at Telegram while a recognition job runs. The long-poll loop awaits each `bot.handleUpdate`, so the bot does not request or process a later update until the active photo has completed or timed out.

If Telegram download, Ollama inference, JSON parsing, or validation fails, that photo is not indexed. The bot logs only safe operational metadata such as chat/message identifiers, candidate count, mode, and error class/message—not caption text, image bytes, or model response body.

Telegram albums are separate photo messages with a shared `media_group_id`; every image is processed independently and receives its own Telegram message URL.

## Data model

### `indexed_messages`

| Field | Meaning |
| --- | --- |
| `plate` | Validated, normalized plate token |
| `chat_id` | Telegram chat scope; mandatory for isolation |
| `message_url` | Direct Telegram message link |
| `message_preview` | `Фото` for new automatic records; older records retain their historical preview |
| `media_type` | `photo` for new automatic records |
| `media_group_id` | Telegram album identifier, when applicable |
| `created_at` | Database creation timestamp |

Uniqueness is `(plate, chat_id, message_url)`: the same photo cannot create duplicate index rows for the same plate.

### `media_group_members`

This table remains for legacy media records. New automatic photo recognition does not depend on mixed-media album inference.

## Privacy and access model

- `ALLOWED_CHAT_IDS` is required at startup and checked in every data-bearing handler.
- Reads and writes are scoped to the originating `chat_id`.
- The database contains no downloaded Telegram media and no full message/caption bodies.
- Message URLs are useful only to Telegram users who already have source-group access.
- Do not configure a cloud endpoint without explicit approval from the data owner and people whose images are processed.

See [MAINTENANCE.md](MAINTENANCE.md) for deployment, shadow-mode validation, backup, and incident procedures.
