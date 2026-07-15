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
.vision-venv/bin/python -m pip install -r requirements.txt
mkdir -p models
.vision-venv/bin/hf download yasirfaizahmed/license-plate-object-detection best.pt --local-dir models
mv models/best.pt models/license-plate-detector.pt
```

FastPlateOCR downloads its ONNX reader on first native use. The current reader file is about 5.3 MB and the current detector is about 6.2 MB. It reads local YOLO crops and never receives a cloud OCR request.

## Configuration

```dotenv
PHOTO_RECOGNITION_TIMEOUT_MS=60000
PHOTO_RECOGNITION_RECOVERY_ATTEMPTS=2
FAST_PLATE_OCR_MODEL=cct-s-v2-global-model
PLATE_DETECTOR_PYTHON=./.vision-venv/bin/python
PLATE_DETECTOR_SCRIPT=./scripts/detect_and_read_plates.py
PLATE_DETECTOR_MODEL=./models/license-plate-detector.pt
```

`ALLOWED_CHAT_IDS` and `TELEGRAM_BOT_TOKEN` are mandatory. Every validated plate recognized in an allow-listed chat is indexed. `/verbose` controls only recognition feedback in the chat.

Replies default to English. `/lang en` and `/lang uk` store a locale per chat in SQLite; `ua` is accepted as a Ukrainian alias. Deployments upgrading an existing database add the locale column with `en` while preserving `/verbose` state.

`PHOTO_RECOGNITION_RECOVERY_ATTEMPTS` accepts `0`, `1`, or `2`. The default `2` enables both `wide` and `enhanced` recovery profiles after a standard pass with zero detector boxes. Recovery succeeds when the enhanced pass shares at least one validated plate with the wide pass; the analyzer then returns the enhanced pass's complete validated list.

## Verification before deployment

```bash
npm ci
npm test
npm run typecheck
npm run lint
npm run build
```

Send clear, angled, distant, dark, and multi-car photos in an allow-listed test supergroup. Use `/verbose on` to see the source link, candidate result, and detector/crop/OCR timings. Every validated candidate is indexed immediately, so use a disposable test chat or remove unwanted test records from SQLite afterward.

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
npm test && npm run typecheck && npm run lint && npm run build
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
4. Command menu contains `/find`, `/list`, `/verbose`, and `/lang` with English and Ukrainian descriptions.
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
- **Bad or missed candidate** — use `/verbose on`, collect representative source links privately, and benchmark before changing the detector/model/validator.
- **Buttons do nothing** — ensure the poller requests `callback_query` updates.

## Security hygiene

Never commit `.env`, tokens, databases, logs, photos, or Telegram exports. Keep host and group access restricted. The bot has no remote OCR endpoint; do not add one without explicit approval.
