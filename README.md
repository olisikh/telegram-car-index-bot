# Telegram car index bot

A privacy-conscious Telegram bot for allow-listed auto-service groups. It analyzes **photo messages only** with one local pipeline: **YOLO plate detection → in-memory crop → FastPlateOCR**. It indexes strictly validated vehicle plates and links users to the original Telegram message.

The active runtime does not persist downloaded photos, crops, captions, or general chat text. Image bytes exist only in memory while one local recognition job runs.

For a new installation, start with the [Beginner setup guide](docs/BEGINNER-SETUP.md).

## Group usage

Send a photo containing a visible registration plate. Captions and ordinary text are ignored.

```text
/find AA1234BB
/find 653
/find AX6
/list
/verbose on
/verbose off
```

`/find` accepts a full plate or a 3–10 character fragment and always stays within the current chat. One matched plate opens its message list immediately; several matches show a paginated plate picker. `/list` shows ten recently seen unique plates per page. Each result links to the source photo and displays its Kyiv date/time.

## Recognition and safety

Every validated plate recognized in an allow-listed chat is stored with its source-message link.

The sole pipeline is conservative:

1. A local YOLO model detects plate regions and selects at most five highest-confidence regions for OCR.
2. The Python worker enlarges those crops and passes RGB pixels to local FastPlateOCR.
3. TypeScript parses the returned JSON, normalizes Ukrainian/Latin lookalikes, and validates every candidate against supported formats.
4. Invalid, malformed, or empty results are never indexed.

By default, a standard pass that finds no detector boxes triggers `wide` and `enhanced` recovery passes. Recovery succeeds when the enhanced pass shares at least one validated plate with the wide pass. The current analyzer then returns the enhanced pass's complete validated list, not only the overlapping plates. If the standard pass finds a box but OCR cannot validate its text, the bot does not guess with recovery profiles.

Supported formats include Ukraine (all-Latin civilian series and four-digit National Police plates), Poland, Germany, Lithuania, Romania, Slovakia, Hungary, and Czechia.

Recognition runs one photo at a time. `/verbose on` enables per-photo feedback for the current chat, including detector, crop, and OCR timings.

## Local dependencies

For native development, use Node.js 24, Python 3.11 or newer, Git, and a repository-local Python virtual environment. The Docker image uses Node.js 24 and Debian Bookworm's Python. The bot does **not** require Ollama.

```bash
python3 -m venv .vision-venv
.vision-venv/bin/python -m pip install --upgrade pip
.vision-venv/bin/python -m pip install -r requirements.txt
mkdir -p models
.vision-venv/bin/hf download yasirfaizahmed/license-plate-object-detection best.pt --local-dir models
mv models/best.pt models/license-plate-detector.pt
```

FastPlateOCR downloads its ONNX reader on its first native invocation. The current reader file is about 5.3 MB and the current detector is about 6.2 MB; Python, Torch, and other dependencies account for most of the installation size. Telegram still supplies the source photo through the Bot API; after that download, detection and OCR run locally.

Example `.env`:

```dotenv
PHOTO_RECOGNITION_TIMEOUT_MS=60000
PHOTO_RECOGNITION_RECOVERY_ATTEMPTS=2
FAST_PLATE_OCR_MODEL=cct-s-v2-global-model
PLATE_DETECTOR_PYTHON=./.vision-venv/bin/python
PLATE_DETECTOR_SCRIPT=./scripts/detect_and_read_plates.py
PLATE_DETECTOR_MODEL=./models/license-plate-detector.pt
```

## Run locally

```bash
cp .env.example .env
# Set TELEGRAM_BOT_TOKEN and ALLOWED_CHAT_IDS.
npm install
npm run build
npm start
```

For development: `npm run dev`.

## Telegram setup

1. Create a bot with [@BotFather](https://t.me/BotFather) and set its token in `.env`.
2. Add it to the intended **supergroup**; clickable source links require a supergroup.
3. Disable BotFather **Group Privacy** so the bot receives ordinary photo updates. Re-add the bot if privacy was changed after it joined.
4. Add the numeric supergroup ID to `ALLOWED_CHAT_IDS`.
5. Send representative photos and use `/verbose on` to inspect recognition results and timings.

## Documentation

- [Beginner setup guide](docs/BEGINNER-SETUP.md)
- [AGENTS.md](AGENTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Docker deployment](docs/DOCKER.md)
- [Maintenance runbook](docs/MAINTENANCE.md)

## Quality checks

```bash
npm test
npm run typecheck
npm run lint
npm run build
```
