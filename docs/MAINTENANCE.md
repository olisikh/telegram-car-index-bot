# Maintenance Runbook

## Local setup

```bash
cp .env.example .env
# Set TELEGRAM_BOT_TOKEN and one or more comma-separated ALLOWED_CHAT_IDS.
npm install
npm test
npm run typecheck
npm run lint
npm run dev
```

`ALLOWED_CHAT_IDS` is mandatory in every environment, including local development. Use a test group/chat ID when developing against Telegram.

## Routine change procedure

1. Work on a focused branch or clean working tree.
2. Add/update tests before changing behavior.
3. Run:

   ```bash
   npm test
   npm run typecheck
   npm run lint
   ```

4. Update `README.md`, `AGENTS.md`, or these docs when behavior/operations change.
5. Commit and push only source, tests, and documentation—not `.env`, `data/`, or logs.
6. Deploy and verify the LaunchAgent as described below.

## Production process: macOS LaunchAgent

Production uses this user LaunchAgent:

```text
com.olisikh.bandera-car-index-bot
```

Its plist is installed at:

```text
~/Library/LaunchAgents/com.olisikh.bandera-car-index-bot.plist
```

The launch agent starts `npm start` from the repository. It writes logs under `data/`:

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

Telemetry logs only update shape (chat/message IDs and media flags), not captions or media bytes.

## Telegram configuration checklist

1. Bot token is valid and present only in `.env`.
2. Bot belongs to the intended supergroup.
3. Group Privacy is disabled in BotFather if the bot must receive ordinary media updates.
4. The group ID is in `ALLOWED_CHAT_IDS`.
5. Bot commands include `/car`, `/find`, and `/list` after startup.
6. For a button-based feature, verify `callback_query` is present in `src/polling.ts` `allowedUpdates`.

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
4. Bootstrap or kickstart the agent again:

   ```bash
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.olisikh.bandera-car-index-bot.plist
   ```

5. Confirm it is running and test `/find` in the intended group.

## Incident response

### `409 Conflict: terminated by other getUpdates request`

Another poller is using the same token. Stop manual `npm start` processes and ensure only the LaunchAgent remains. If the owner cannot identify the other client, revoke/regenerate the token in BotFather, update `.env`, and restart the agent.

### `/list` renders but buttons do nothing

Confirm the loop requests `callback_query` as well as `message` updates. This is a polling configuration issue, not a keyboard-layout issue.

### Photo/video was not indexed

First verify the exact `/car <plate>` command/caption was used and that the group is allow-listed. Then inspect telemetry to see how Telegram classified it (`photo`, `video`, `animation`, or `document`). Videos sent as files are handled when their MIME type begins with `video/`.

### Bot ignores everything

Check the agent status and both logs. Then check `ALLOWED_CHAT_IDS`, Group Privacy configuration, and whether a bot-token conflict appears in the error log.

## Security hygiene

- Never paste a full production token into an issue, commit, or documentation.
- Rotate tokens immediately after accidental exposure.
- Back up the database securely; never upload it to public issue trackers.
- Keep access to the Telegram group and the host account limited to authorized staff.
