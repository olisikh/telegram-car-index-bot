# Beginner setup guide

This guide installs the bot on macOS, Windows, or Linux.

## What it runs

```text
Telegram photo -> local YOLO detector -> local FastPlateOCR reader -> local SQLite index
```

No cloud OCR service or Ollama installation is required. Telegram supplies each source photo through the Bot API; the active runtime then keeps the downloaded bytes and crops in memory while processing the image locally.

The current detector file is about 6.2 MB and the current FastPlateOCR reader is about 5.3 MB. Python, Torch, and the remaining packages account for most of the installation and image size. This repository does not publish a measured minimum RAM or disk requirement.

## 1. Prepare Telegram

1. Create a bot with `@BotFather` using `/newbot`.
2. Run `/setprivacy`, choose the bot, and choose **Disable**.
3. Add the bot to the intended Telegram **supergroup**. Supergroups are required for clickable `/find` links.
4. If privacy was disabled after adding the bot, remove it and add it again.
5. Send `/start` in the group, then obtain the group ID (normally `-100...`) from your own bot's `getUpdates` response before starting its long poller. Do not add a third-party ID bot to a private group. Inspect only `message.chat.id`, `message.chat.type`, and `message.chat.title`; do not save the rest of the update payload.

Keep the bot token secret.

## 2. Get the project

```bash
git clone https://github.com/olisikh/telegram-car-index-bot.git
cd telegram-car-index-bot
```

## 3. Choose Docker on Windows (recommended)

For a Windows laptop, use the one-image Docker route in [DOCKER.md](DOCKER.md). It needs only Docker Desktop with its WSL 2 Linux backend; it bundles Node.js, Python, YOLO, FastPlateOCR, and both model files. Do not follow the native Node/Python instructions below unless you specifically need a developer setup.

## 4. Native development prerequisites

### macOS / Linux

```bash
cp .env.example .env
npm install
python3 -m venv .vision-venv
.vision-venv/bin/python -m pip install --upgrade pip
.vision-venv/bin/python -m pip install -r requirements.txt
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
.\.vision-venv\Scripts\python.exe -m pip install -r requirements.txt
New-Item -ItemType Directory -Force models
.\.vision-venv\Scripts\hf.exe download yasirfaizahmed/license-plate-object-detection best.pt --local-dir models
Move-Item models\best.pt models\license-plate-detector.pt
```

FastPlateOCR downloads its small reader model the first time a photo is recognized.

## 5. Configure `.env`

Set your real token and group ID. If the ID is still unknown, first set the token, send `/start` in the group, and query `getUpdates` once while no bot process is running. Calling `getUpdates` while the service is running creates a competing poller.

```dotenv
TELEGRAM_BOT_TOKEN=PASTE_YOUR_BOT_TOKEN_HERE
ALLOWED_CHAT_IDS=-1001234567890
DATABASE_PATH=./data/index.db

PHOTO_RECOGNITION_TIMEOUT_MS=60000
PHOTO_RECOGNITION_RECOVERY_ATTEMPTS=2
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
npm run build
npm start
```

In the target chat, send `/verbose on`, then send a normal car photo as a **photo**, not a file. The bot will show the recognition result and detector/crop/OCR timing. Every validated plate is indexed immediately.

Test clear, angled, distant, dark, and multi-car photos. `/verbose` can be disabled after checking the results; indexing remains enabled.

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

On macOS, use the provided LaunchAgent procedure in [MAINTENANCE.md](MAINTENANCE.md). On Windows or Linux, run `npm run build` after each source update, then use Task Scheduler or a system service to run `npm start` from the project folder. Never run two copies of the bot with the same token: Telegram will stop one poller with a `409 Conflict` error.

## Troubleshooting

| Problem | Check |
| --- | --- |
| Bot receives commands but not photos | Group Privacy disabled, then remove/re-add the bot. |
| Bot does not start | Python path, worker script, and detector model path exist. |
| No plates saved | Use `/verbose on`, send a native Telegram photo, and verify that recognition returns a validated plate. |
| `/list` buttons do nothing | Check the running process/logs; the bot must request callback updates. |
| Recognition is wrong | Use `/verbose on` and compare representative photos before changing validation or models. |
