# Telegram car index bot

A privacy-conscious Telegram bot for allow-listed auto-service groups. It analyzes **photo messages only** with local Ollama vision, indexes strictly validated vehicle plates, and links users back to the original Telegram message.

The bot does not persist downloaded photos, video files, captions, or general chat text. A photo exists only in memory while it is sent to the configured local Ollama endpoint.

## Getting started

If you are setting up the bot on a new Mac, Windows PC, or Linux computer, follow the non-technical [Beginner setup guide](docs/BEGINNER-SETUP.md) first. It covers Telegram setup, local models, first safe test, and keeping the bot running.

## Usage in the group

Send a photo containing a visible vehicle registration plate. The bot ignores captions and ordinary text.

Search an indexed plate:

```text
/find AA1234BB
```

Browse distinct indexed cars, newest mention first:

```text
/list
```

The `/list` widget shows ten plates per page. Tapping a plate runs the same chat-scoped search as `/find <plate>`.

## Recognition modes

Configure `PHOTO_RECOGNITION_MODE` in `.env`:

| Mode | Behavior |
| --- | --- |
| `shadow` | Analyze each photo locally, but do **not** write recognized plates to the database. Use this to validate accuracy safely. |
| `index` | Analyze each photo and index every validated plate it returns. |

Start with `shadow`. After representative group photos show sufficiently reliable results, switch to `index` and restart the LaunchAgent.

Recognition is conservative:

1. Ollama must return strict JSON containing plate candidates.
2. The bot normalizes Ukrainian/Latin lookalikes and removes visual separators.
3. Every candidate must match a supported civilian format.
4. Invalid, malformed, or empty model output is never indexed.
5. Multiple valid plates in one photo are indexed separately against the same source message.

Supported formats currently include Ukraine (including all-Latin civilian series and four-digit National Police blue plates), Poland, Germany, Lithuania, Romania, Slovakia, Hungary, and Czechia. The same validation is used by `/find`.

## Recognition strategies

`PHOTO_RECOGNITION_STRATEGY` selects the reader pipeline independently of whether results are indexed:

| Strategy | Flow | Use |
| --- | --- | --- |
| `full-image` | Full Telegram photo → local Ollama | Legacy diagnostic fallback for comparison/rollback; not the default for a new deployment. |
| `detector-crop` | Full photo → local YOLO plate detector → enlarged in-memory crop(s) → local Ollama | Supported production path; recommended for distant/small plates. |

`detector-crop` never writes source photos or crops to disk. The detector receives image bytes on stdin and returns JPEG crops in memory to the TypeScript bot. It checks up to five confident plate regions per photo.

The supported production mode is `detector-crop` with `qwen2.5vl:7b`. `full-image` remains available only for controlled diagnostic comparison or rollback after a LaunchAgent restart.

## Recognition feedback

Recognition feedback is disabled by default and stored independently for each allowed chat. Control it from that chat:

```text
/verbose on
/verbose off
```

With verbose mode on, the bot replies after every photo with a direct source-photo link, recognized plate(s) when available, and the elapsed analysis time. It distinguishes a readable no-result, a timeout, and an unexpected processing crash. Internal error details remain only in the protected host logs.

Use `/verbose on` in your direct-message test chat. Keep busy service groups off unless a reply per image is wanted.

## Local Ollama setup

The default local configuration is:

```dotenv
PHOTO_RECOGNITION_MODE=shadow
PHOTO_RECOGNITION_STRATEGY=detector-crop
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5vl:7b
OLLAMA_TIMEOUT_MS=60000
```

The configured model must support image input. Verify it with:

```bash
ollama show qwen2.5vl:7b
```

The supported production path is local YOLO detector-crop → local `qwen2.5vl:7b` reader. Smaller/experimental readers must be evaluated in `shadow` mode on representative real photos before they are allowed to index records. Recognition runs one photo at a time to avoid exhausting a 16 GB host.

### Detector-crop local dependencies

`detector-crop` requires a local Python environment and the local Apache-2.0 YOLOv8 plate detector. These are intentionally ignored by Git:

```bash
python3 -m venv .vision-venv
.vision-venv/bin/python -m pip install --upgrade pip
.vision-venv/bin/python -m pip install ultralytics huggingface_hub
mkdir -p models
.vision-venv/bin/hf download yasirfaizahmed/license-plate-object-detection best.pt --local-dir models
mv models/best.pt models/license-plate-detector.pt
```

The active detector model is 5.9 MiB and has SHA-256 `d06657407970f80f1a12eb9f340661ecd003bbe44ff8feac3d5bc38845f11a94`. It is a locally stored model; it receives source image bytes only in memory.

## Run locally

```bash
cp .env.example .env
# Set TELEGRAM_BOT_TOKEN and ALLOWED_CHAT_IDS.
npm install
npm start
```

For development with auto-restart:

```bash
npm run dev
```

## Set up Telegram

1. Create a bot in [@BotFather](https://t.me/BotFather) with `/newbot`; put its token in `.env`.
2. Add the bot to the intended **supergroup**. Clickable source-message links require a supergroup; a private one normally has an ID beginning with `-100`.
3. In BotFather, disable **Group Privacy** (`/setprivacy` → Disable), so ordinary photo updates can reach the bot. If the bot was already in that group, remove and re-add it after changing this setting.
4. Get the numeric chat ID with a utility such as [@RawDataBot](https://t.me/RawDataBot), then add it to `ALLOWED_CHAT_IDS`. Migrating a basic group to a supergroup creates a new chat ID, which must replace the old one.
5. Send test photos in `shadow` mode and inspect operational logs before enabling `index` mode.

## Operational notes

- The bot indexes only native Telegram `photo` messages it receives after it is added; it cannot backfill Telegram group history. A caption attached to a photo is ignored, but the photo itself is analyzed.
- Telegram albums arrive as separate photo messages. Each image is analyzed separately and retains its own source link.
- Clickable direct links require a supergroup; private-supergroup links work only for people who already belong to that group.
- `ALLOWED_CHAT_IDS` is required at startup; never run the bot without it.
- `data/index.db` is the durable index; back it up securely. Do not expose it or `.env`.
- The bot sends photos only to the configured `OLLAMA_BASE_URL`. The default endpoint is local; changing it to a cloud endpoint transfers images to that service and requires an explicit privacy review.

## Documentation

- [Beginner setup guide](docs/BEGINNER-SETUP.md) — non-technical installation and first-run instructions for macOS, Windows, and Linux.
- [AGENTS.md](AGENTS.md) — development rules, privacy constraints, and Telegram/Ollama pitfalls.
- [Architecture](docs/ARCHITECTURE.md) — runtime flow, commands, data model, and trust boundaries.
- [Maintenance runbook](docs/MAINTENANCE.md) — deployment, logging, backups, recovery, and incident response.
- [Automatic recognition migration record](docs/PHOTO-OCR-PLAN.md) — completed migration context and preserved constraints.

## Quality checks

```bash
npm test
npm run typecheck
npm run lint
```
