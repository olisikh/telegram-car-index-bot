# Telegram car index bot

A privacy-conscious Telegram bot for indexing explicitly tagged vehicle media/messages in an allow-listed group and linking users back to the original message.

## Usage in the group

Send a `/car` command as a regular message or as a photo/video caption. Native videos, animated videos, and videos sent as files are recognized:

```text
/car AA1234BB
```

The first word after `/car` must be one contiguous plate token — no spaces or hyphens. Ukrainian plates plus standard civilian formats for Poland, Germany, Lithuania, Romania, Slovakia, Hungary, and Czechia are accepted. The rest of the message is ignored by the index, so this works:

```text
/car AA1234BB maintenance complete
```

The bot replies `✅ Збережено AA1234BB` when it has recorded the message.

Search later:

```text
/find AA1234BB
```

Or browse the ten most recently mentioned distinct cars per page:

```text
/list
```

Tap a plate button to run the same per-chat search as `/find <plate>`.

Each result includes a clickable `лінк` and a normalized preview stored at a maximum of 70 symbols. For `/car AA1234BB maintenance complete`, the preview is `maintenance complete`. Without a note, new photo and video records show `Фото` or `Відео`; an observed mixed album shows `Фото і Відео`.

The bot normalizes Ukrainian/Latin lookalikes (`АА1234ВВ` becomes `AA1234BB`) but requires a contiguous plate token. It stores the normalized plate, a compact preview, and the original Telegram message URL — not a duplicate of the media.

## Run locally

```bash
cp .env.example .env
# edit .env: add TELEGRAM_BOT_TOKEN and ALLOWED_CHAT_IDS
npm install
npm start
```

For development with auto-restart:

```bash
npm run dev
```

## Set up Telegram

1. Create a bot in [@BotFather](https://t.me/BotFather) with `/newbot`; copy its token into `.env`.
2. Add the bot to the target **supergroup**.
3. In BotFather, disable **Group Privacy** (`/setprivacy` → Disable), so photo captions reach the bot.
4. Get the numeric chat ID with a utility such as [@RawDataBot](https://t.me/RawDataBot), set `ALLOWED_CHAT_IDS`, then start the bot.
5. Index with `/car AA1234BB` as a message or photo/video caption; use `/find AA1234BB` or `/list` to retrieve records.

## Operational notes

- The bot indexes only messages it receives after it is added; it does not backfill group history.
- Direct links for private groups work only for people who are members of that group.
- `ALLOWED_CHAT_IDS` is required at startup; never run the bot without it.
- `data/index.db` is the durable index; back it up securely. Do not expose it or the `.env` file.

## Documentation

- [AGENTS.md](AGENTS.md) — development rules and safety constraints for contributors/agents.
- [Architecture](docs/ARCHITECTURE.md) — runtime flow, commands, data model, and privacy boundaries.
- [Photo OCR plan](docs/PHOTO-OCR-PLAN.md) — proposed automatic plate linking from vehicle and order-document photos.
- [Maintenance runbook](docs/MAINTENANCE.md) — deployment, logging, backups, recovery, and incident response.

## Quality checks

```bash
npm test
npm run typecheck
npm run lint
```
