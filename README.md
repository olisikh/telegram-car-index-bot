# Telegram car index bot

A privacy-conscious Telegram bot for allow-listed auto-service groups. It analyzes **photo messages only** with local Ollama vision, indexes strictly validated vehicle plates, and links users back to the original Telegram message.

The bot does not persist downloaded photos, video files, captions, or general chat text. A photo exists only in memory while it is sent to the configured local Ollama endpoint.

## Getting started

If you are setting up the bot on a new Mac, Windows PC, or Linux computer, follow the non-technical [Beginner setup guide](docs/BEGINNER-SETUP.md) first. It covers Telegram setup, local models, first safe test, and keeping the bot running.

## Usage in the group

Send a photo containing a visible vehicle registration plate. The bot ignores captions and ordinary text.

Search an indexed plate or a 3+ character fragment of a plate:

```text
/find AA1234BB
/find 653
/find AX6
```

The first example looks for the exact plate; shorter queries use a full-text plate index to match any substring of stored plates. Results are always scoped to the current chat. Every result line includes the matched plate, then its source link and Kyiv timestamp, so a broad query remains scannable.

Browse distinct indexed cars, newest mention first:

```text
/list
```

The `/list` widget shows ten plates per page. Tapping a plate runs the same chat-scoped search as `/find <plate>`. Each `/find` result links to the source photo and shows its date and time in the `Europe/Kyiv` time zone, for example `13.07.2026 14:25`.

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
| `detector-crop` | Full photo → local YOLO plate detector → enlarged in-memory crop(s) → local Ollama | Supported production accuracy-first path; recommended for distant/small plates. |
| `detector-fast-ocr` | Full photo → local YOLO plate detector → enlarged in-memory crop(s) → local FastPlateOCR ONNX reader | Flow 3 lightweight experiment; use `shadow` mode until benchmarked on representative photos. |

The detector receives image bytes on stdin and returns JPEG crops in memory to the TypeScript bot. It checks up to five confident plate regions per photo. `detector-fast-ocr` uses the same in-memory detector/crop step, but runs FastPlateOCR inside the local Python process and returns only candidate plate strings; it does not contact Ollama.

The supported production mode is `detector-crop` with `qwen2.5vl:7b`. `detector-fast-ocr` is the additive Flow 3 reader experiment: it keeps the same detector/crops while replacing Qwen with a local FastPlateOCR ONNX reader. `full-image` remains available only for controlled diagnostic comparison or rollback after a LaunchAgent restart.

## Recognition feedback

Recognition feedback is disabled by default and stored independently for each allowed chat. Control it from that chat:

```text
/verbose on
/verbose off
```

With verbose mode on, the bot replies after every photo with a direct source-photo link, recognized plate(s) when available, and the elapsed analysis time. For detector strategies it also breaks the work down into `🕵️‍♂️ Пошук` (detector), `✂️ Обрізання` (crop preparation), and `👁️ OCR` (reader) so the bottleneck is visible. It distinguishes a readable no-result, a timeout, and an unexpected processing crash. Internal error details remain only in the protected host logs.

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

### Flow 3: FastPlateOCR local reader

`detector-fast-ocr` is an optional lightweight reader for hardware that cannot comfortably run Qwen. Install it into the same local detector virtual environment:

```bash
.vision-venv/bin/python -m pip install 'fast-plate-ocr[onnx]'
```

Then use this only for a shadow benchmark:

```dotenv
PHOTO_RECOGNITION_MODE=shadow
PHOTO_RECOGNITION_STRATEGY=detector-fast-ocr
FAST_PLATE_OCR_MODEL=cct-s-v2-global-model
```

FastPlateOCR downloads an approximately 5 MB ONNX reader on first use. It is a reader, not a detector: the existing local YOLO crop stage remains mandatory. Its optional region result is ignored; the existing Ukrainian/EU validator remains the authority for acceptance.

Do not switch a live indexing chat to this strategy from one successful photo. Compare exact plate reads against the Qwen path across clear, distant, angled, dark, reflective, multi-car, Ukrainian civilian, and four-digit police photos first. Even after the benchmark, Flow 3 refuses to write records unless `FAST_PLATE_OCR_ALLOW_INDEX=true` is explicitly set alongside `PHOTO_RECOGNITION_MODE=index`.

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
