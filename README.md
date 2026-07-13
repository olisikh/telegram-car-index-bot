# Telegram car index bot

A privacy-conscious Telegram bot for allow-listed auto-service groups. It analyzes **photo messages only** with local Ollama vision, indexes strictly validated vehicle plates, and links users back to the original Telegram message.

The bot does not persist downloaded photos, video files, captions, or general chat text. A photo exists only in memory while it is sent to the configured local Ollama endpoint.

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
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gemma4:latest
OLLAMA_TIMEOUT_MS=60000
```

The model must support image input. Verify it with:

```bash
ollama show gemma4:latest
```

The production Mac currently has a local vision-capable `gemma4:latest` model installed. Recognition runs one photo at a time to avoid exhausting the machine’s 16 GB memory.

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
2. Add the bot to the intended **supergroup**.
3. In BotFather, disable **Group Privacy** (`/setprivacy` → Disable), so ordinary photo updates can reach the bot.
4. Get the numeric chat ID with a utility such as [@RawDataBot](https://t.me/RawDataBot), then add it to `ALLOWED_CHAT_IDS`.
5. Send test photos in `shadow` mode and inspect operational logs before enabling `index` mode.

## Operational notes

- The bot indexes only photo messages it receives after it is added; it cannot backfill Telegram group history.
- Telegram albums arrive as separate photo messages. Each image is analyzed separately and retains its own source link.
- Direct links for private groups work only for people who are members of that group.
- `ALLOWED_CHAT_IDS` is required at startup; never run the bot without it.
- `data/index.db` is the durable index; back it up securely. Do not expose it or `.env`.
- The bot sends photos only to the configured `OLLAMA_BASE_URL`. The default endpoint is local; changing it to a cloud endpoint transfers images to that service and requires an explicit privacy review.

## Documentation

- [AGENTS.md](AGENTS.md) — development rules, privacy constraints, and Telegram/Ollama pitfalls.
- [Architecture](docs/ARCHITECTURE.md) — runtime flow, commands, data model, and trust boundaries.
- [Maintenance runbook](docs/MAINTENANCE.md) — deployment, logging, backups, recovery, and incident response.

## Quality checks

```bash
npm test
npm run typecheck
npm run lint
```
