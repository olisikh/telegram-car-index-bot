# Beginner setup guide

This guide installs the bot on macOS, Windows, or Linux.

## What it runs

```text
Telegram photo -> local YOLO detector -> local FastPlateOCR reader -> local SQLite index
```

No cloud OCR service or Ollama installation is required. Source photos and crops stay in memory while one image is processed.

Recommended: 16 GB RAM and at least 10 GB free disk. The Python environment is the largest component; the FastPlateOCR reader download is about 5 MB.

## 1. Prepare Telegram

1. Create a bot with `@BotFather` using `/newbot`.
2. Run `/setprivacy`, choose the bot, and choose **Disable**.
3. Add the bot to the intended Telegram **supergroup**. Supergroups are required for clickable `/find` links.
4. If privacy was disabled after adding the bot, remove it and add it again.
5. Obtain the group ID (normally `-100...`) with a utility such as `@RawDataBot` and save it for configuration.

Keep the bot token secret.

## 2. Get the project

```bash
git clone https://github.com/olisikh/telegram-car-index-bot.git
cd telegram-car-index-bot
```

## 3. Install prerequisites

Install Node.js 22+, Python 3.11+, and Git.

```bash
node --version
npm --version
python3 --version
```

On Windows use `py --version` if `python3` is unavailable.

## 4. Install the local recognition stack

### macOS / Linux

```bash
cp .env.example .env
npm install
python3 -m venv .vision-venv
.vision-venv/bin/python -m pip install --upgrade pip
.vision-venv/bin/python -m pip install ultralytics huggingface_hub 'fast-plate-ocr[onnx]'
mkdir -p models
.vision-venv/bin/hf download yasirfaizahmed/license-plate-object-detection best.pt --local-dir models
mv models/best.pt models/license-plate-detector.pt
```

### Windows PowerShell

```powershell
Copy-Item .env.example .env
npm install
py -3 -m venv .vision-venv
.\.vision-venv\Scripts\python.exe -m pip install --upgrade pip
.\.vision-venv\Scripts\python.exe -m pip install ultralytics huggingface_hub 'fast-plate-ocr[onnx]'
New-Item -ItemType Directory -Force models
.\.vision-venv\Scripts\hf.exe download yasirfaizahmed/license-plate-object-detection best.pt --local-dir models
Move-Item models\best.pt models\license-plate-detector.pt
```

FastPlateOCR downloads its small reader model the first time a photo is recognized.

## 5. Configure `.env`

Set your real token and group ID:

```dotenv
TELEGRAM_BOT_TOKEN=PASTE_YOUR_BOT_TOKEN_HERE
ALLOWED_CHAT_IDS=-1001234567890
DATABASE_PATH=./data/index.db

# Start safely: test recognition without database writes.
PHOTO_RECOGNITION_MODE=shadow
PHOTO_RECOGNITION_TIMEOUT_MS=60000
FAST_PLATE_OCR_MODEL=cct-s-v2-global-model

# macOS / Linux paths:
PLATE_DETECTOR_PYTHON=./.vision-venv/bin/python
PLATE_DETECTOR_SCRIPT=./scripts/detect_and_read_plates.py
PLATE_DETECTOR_MODEL=./models/license-plate-detector.pt
```

On Windows change `PLATE_DETECTOR_PYTHON` to:

```dotenv
PLATE_DETECTOR_PYTHON=./.vision-venv/Scripts/python.exe
```

For multiple groups, separate IDs with commas.

## 6. Test before indexing

```bash
npm start
```

In the target chat, send `/verbose on`, then send a normal car photo as a **photo**, not a file. The bot will show the recognition result and detector/crop/OCR timing. In `shadow` mode it writes nothing to the database.

Test clear, angled, distant, dark, and multi-car photos. When you trust the recognition results, change this one value and restart the service:

```dotenv
PHOTO_RECOGNITION_MODE=index
```

## Using the bot

```text
/find AA1234BB
/find 653
/list
/verbose on
/verbose off
```

`/find` opens messages immediately for one matched plate or shows a paginated plate picker for several matching plates.

## Keep it running

On macOS, use the provided LaunchAgent procedure in [MAINTENANCE.md](MAINTENANCE.md). On Windows or Linux, use Task Scheduler or a system service to run `npm start` from the project folder. Never run two copies of the bot with the same token: Telegram will stop one poller with a `409 Conflict` error.

## Troubleshooting

| Problem | Check |
| --- | --- |
| Bot receives commands but not photos | Group Privacy disabled, then remove/re-add the bot. |
| Bot does not start | Python path, worker script, and detector model path exist. |
| No plates saved | Confirm `PHOTO_RECOGNITION_MODE=index` only after testing. |
| `/list` buttons do nothing | Check the running process/logs; the bot must request callback updates. |
| Recognition is wrong | Return to `shadow`, use `/verbose on`, and compare representative photos before changing validation or models. |
