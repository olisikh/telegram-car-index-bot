# Maintenance Runbook

## Local setup

> For a new non-technical installation on macOS, Windows, or Linux, start with [BEGINNER-SETUP.md](BEGINNER-SETUP.md). This runbook is for ongoing technical maintenance after installation.

```bash
cp .env.example .env
# Set TELEGRAM_BOT_TOKEN and one or more comma-separated ALLOWED_CHAT_IDS.
# Keep PHOTO_RECOGNITION_MODE=shadow while validating local recognition.
npm install
npm test
npm run typecheck
npm run lint
npm run dev
```

`ALLOWED_CHAT_IDS` is mandatory in every environment. The default Ollama endpoint is local:

```dotenv
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gemma4:latest
OLLAMA_TIMEOUT_MS=60000
PHOTO_RECOGNITION_STRATEGY=full-image
```

Verify the configured model is local and vision-capable:

```bash
ollama show "$OLLAMA_MODEL"
curl --silent --show-error http://127.0.0.1:11434/api/tags
```

### Detector-crop prerequisites

When `PHOTO_RECOGNITION_STRATEGY=detector-crop`, these repository-local artifacts must exist before the LaunchAgent starts:

```bash
./.vision-venv/bin/python
./scripts/detect_plate_crops.py
./models/license-plate-detector.pt
```

The application validates all three at startup. Recreate them using the commands in [README.md](../README.md#detector-crop-local-dependencies). Keep the Python environment and model out of Git; they are intentionally ignored.

## Recognition rollout procedure

### 1. Verify Telegram photo delivery

With Group Privacy disabled and the bot in the intended allowed group, send:

- a plain single photo;
- a photo with a caption;
- a multi-photo Telegram album.

Confirm `data/bot.out.log` records `photo=true` for every expected message. The bot deliberately ignores captions and text.

### 2. Shadow-mode validation

Keep this setting while testing the database-write policy:

```dotenv
PHOTO_RECOGNITION_MODE=shadow
```

For direct-message evaluation, enable per-photo responses in that chat:

```text
/verbose on
```

Send representative real service photos: clear, angled, distant, dark, and album photos. The bot analyzes them but writes no new index rows. Review safe telemetry:

```bash
tail -f ~/telegram-car-index-bot/data/bot.out.log
```

Expected completion line:

```text
photo recognition chat=<id> message=<id> candidates=<n> mode=shadow
```

Compare candidates against the original images in Telegram. Do not treat a successful model response as proven accuracy—measure exact plate reads on representative images.

### 3. Enable automatic indexing

Only after review, change:

```dotenv
PHOTO_RECOGNITION_MODE=index
```

Then restart the agent. New valid candidates will be indexed; historical records remain unchanged.

## Routine change procedure

1. Work on a focused branch or clean working tree.
2. Add/update tests before changing behavior.
3. Run:

   ```bash
   npm test
   npm run typecheck
   npm run lint
   ```

4. Update `README.md`, `AGENTS.md`, and docs when behavior/operations change.
5. Commit and push source, tests, and documentation only—not `.env`, `data/`, logs, or test photos.
6. Deploy and verify the LaunchAgent.

## Production process: macOS LaunchAgent

Production uses this user LaunchAgent:

```text
com.olisikh.bandera-car-index-bot
```

Its plist is installed at:

```text
~/Library/LaunchAgents/com.olisikh.bandera-car-index-bot.plist
```

The agent starts `npm start` from the repository. It writes logs under `data/`:

```text
data/bot.out.log
data/bot.err.log
```

### Check status

```bash
launchctl print gui/$(id -u)/com.olisikh.bandera-car-index-bot
```

A healthy process reports `state = running` and a current PID.

### Apply a code/configuration change

Do **not** run `npm start` manually while the agent is running; that creates a second long-polling client and Telegram returns `409 Conflict`.

```bash
cd ~/telegram-car-index-bot
git pull
npm test && npm run typecheck && npm run lint
launchctl kickstart -k gui/$(id -u)/com.olisikh.bandera-car-index-bot
launchctl print gui/$(id -u)/com.olisikh.bandera-car-index-bot
```

### Read logs

```bash
tail -f ~/telegram-car-index-bot/data/bot.out.log
tail -f ~/telegram-car-index-bot/data/bot.err.log
```

Logs must not contain captions, downloaded image data, full model responses, or bot tokens.

## Telegram configuration checklist

1. Bot token is valid and present only in `.env`.
2. Bot belongs to the intended supergroup.
3. Group Privacy is disabled in BotFather if ordinary photo updates must reach the bot.
4. The group ID is in `ALLOWED_CHAT_IDS`.
5. Bot commands include `/find`, `/list`, and `/verbose` after startup; `/car` must not appear.
6. `src/polling.ts` requests both `message` and `callback_query` updates.
7. Ollama is reachable at the configured `OLLAMA_BASE_URL` before enabling `index` mode.
8. If `PHOTO_RECOGNITION_STRATEGY=detector-crop`, the local detector Python/script/model files pass the startup check.

## Database backup and recovery

The durable index is `data/index.db`. SQLite uses WAL mode, so copy it with SQLite's backup command rather than a naive file copy while the bot runs.

### Backup

```bash
cd ~/telegram-car-index-bot
mkdir -p backups
sqlite3 data/index.db ".backup 'backups/index-$(date +%Y%m%d-%H%M%S).db'"
```

Protect backups exactly like the primary database: they contain plates and Telegram message links. Keep them outside version control and encrypt them at rest if moved off the host.

### Restore

1. Stop the agent:

   ```bash
   launchctl bootout gui/$(id -u)/com.olisikh.bandera-car-index-bot
   ```

2. Keep a copy of the current database, then replace `data/index.db` with the chosen backup.
3. Remove stale `data/index.db-wal` and `data/index.db-shm` files if present.
4. Bootstrap the agent again:

   ```bash
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.olisikh.bandera-car-index-bot.plist
   ```

5. Confirm it is running and test `/find` in the intended group.

## Incident response

### `409 Conflict: terminated by other getUpdates request`

Another poller is using the same token. Stop manual `npm start` processes and ensure only the LaunchAgent remains. If the owner cannot identify the other client, revoke/regenerate the token in BotFather, update `.env`, and restart the agent.

### `/list` renders but buttons do nothing

Confirm the loop requests `callback_query` as well as `message` updates. This is a polling configuration issue, not a keyboard-layout issue.

### Photo was not analyzed

Check that the message is a Telegram `photo`, the group is allow-listed, and Group Privacy is disabled. Confirm Ollama is running, then inspect `bot.err.log` for Telegram download, timeout, or Ollama HTTP failures.

### Candidate is wrong or a clear plate was missed

Leave the bot in `shadow` mode. Capture the message link and expected plate in a private evaluation note, but do not commit source photos or plate datasets to this repository. Compare multiple representative cases before changing prompt, model, or validation policy.

### Bot ignores everything

Check the agent status and both logs. Then check `ALLOWED_CHAT_IDS`, Group Privacy configuration, Ollama reachability, and whether a bot-token conflict appears in the error log.

## Security hygiene

- Never paste a full production token into an issue, commit, or documentation.
- Rotate tokens immediately after accidental exposure.
- Do not point `OLLAMA_BASE_URL` at a remote/cloud service without explicit approval: it transfers incoming Telegram images outside this Mac.
- Back up the database securely; never upload it to public issue trackers.
- Keep access to the Telegram group and the host account limited to authorized staff.
