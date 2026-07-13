# Maintenance Runbook

For first installation use [BEGINNER-SETUP.md](BEGINNER-SETUP.md). This document covers ongoing maintenance.

## Required local stack

The bot has one recognition path and does **not** require Ollama:

```text
Telegram photo -> local YOLO detector -> FastPlateOCR -> SQLite index
```

Required repository-local artifacts:

```text
./.vision-venv/bin/python
./scripts/detect_and_read_plates.py
./models/license-plate-detector.pt
```

Install or recreate them:

```bash
python3 -m venv .vision-venv
.vision-venv/bin/python -m pip install --upgrade pip
.vision-venv/bin/python -m pip install ultralytics huggingface_hub 'fast-plate-ocr[onnx]'
mkdir -p models
.vision-venv/bin/hf download yasirfaizahmed/license-plate-object-detection best.pt --local-dir models
mv models/best.pt models/license-plate-detector.pt
```

FastPlateOCR downloads its small ONNX reader on first use. It reads the local YOLO crops and never receives a cloud request.

## Configuration

```dotenv
PHOTO_RECOGNITION_MODE=shadow
PHOTO_RECOGNITION_TIMEOUT_MS=60000
FAST_PLATE_OCR_MODEL=cct-s-v2-global-model
PLATE_DETECTOR_PYTHON=./.vision-venv/bin/python
PLATE_DETECTOR_SCRIPT=./scripts/detect_and_read_plates.py
PLATE_DETECTOR_MODEL=./models/license-plate-detector.pt
```

`ALLOWED_CHAT_IDS` and `TELEGRAM_BOT_TOKEN` are mandatory. Use `shadow` to verify real photos without writes. After representative testing, set `PHOTO_RECOGNITION_MODE=index` and restart the agent.

## Verification before deployment

```bash
npm ci
npm test
npm run typecheck
npm run lint
```

Send clear, angled, distant, dark, and multi-car photos in `shadow` mode. Use `/verbose on` in a private test chat to see source link, candidate result, and detector/crop/OCR timings. Validate exact plate text manually before enabling `index`.

## macOS LaunchAgent

Production uses `com.olisikh.bandera-car-index-bot` at:

```text
~/Library/LaunchAgents/com.olisikh.bandera-car-index-bot.plist
```

It writes operational logs to `data/bot.out.log` and `data/bot.err.log`.

### Deploy an update

Do not run `npm start` manually while the LaunchAgent is running: two pollers cause Telegram `409 Conflict`.

```bash
cd ~/telegram-car-index-bot
git pull --ff-only
npm ci
npm test && npm run typecheck && npm run lint
launchctl kickstart -k gui/$(id -u)/com.olisikh.bandera-car-index-bot
launchctl print gui/$(id -u)/com.olisikh.bandera-car-index-bot
```

A healthy service reports `state = running` and a current PID. The startup log names `pipeline=detector-fast-ocr`.

### Logs

```bash
tail -f ~/telegram-car-index-bot/data/bot.out.log
tail -f ~/telegram-car-index-bot/data/bot.err.log
```

Logs must not contain image bytes, captions, full model output, or tokens.

## Telegram checklist

1. Bot belongs to the intended supergroup.
2. Group Privacy is disabled so normal photo updates arrive.
3. Group ID is in `ALLOWED_CHAT_IDS`.
4. Command menu contains `/find`, `/list`, `/verbose`.
5. Detector Python, script, and model pass the startup existence check.
6. FastPlateOCR is installed in that Python environment.

## Database backup and restore

The durable index is `data/index.db`; use SQLite backup while the bot runs:

```bash
mkdir -p backups
sqlite3 data/index.db ".backup 'backups/index-$(date +%Y%m%d-%H%M%S).db'"
```

Protect backups like the primary database: they contain plate numbers and Telegram links. To restore, stop the agent, retain a copy of the current database, replace `data/index.db`, remove stale `index.db-wal`/`index.db-shm`, then bootstrap or kickstart the LaunchAgent.

## Common incidents

- **409 Conflict** — stop manual bot processes; only the LaunchAgent may poll with this token. Revoke the token if an unknown poller persists.
- **Photo not analyzed** — verify it was sent as a Telegram photo, the chat is allow-listed, Group Privacy is disabled, and inspect `bot.err.log`.
- **Bad or missed candidate** — return to `shadow`, collect representative source links privately, and benchmark before changing the detector/model/validator.
- **Buttons do nothing** — ensure the poller requests `callback_query` updates.

## Security hygiene

Never commit `.env`, tokens, databases, logs, photos, or Telegram exports. Keep host and group access restricted. The bot has no remote OCR endpoint; do not add one without explicit approval.
