# Telegram car index bot

Indexes Telegram **photo messages** whose captions contain Ukrainian vehicle registration numbers, then returns links to the original messages.

## Usage in the group

For reliable delivery in this group, send the photo with this **caption**:

```text
/car AA1234BB
```

`/car` is a Telegram command, so it is delivered even in groups where ordinary photo updates are not reaching the bot. The bot replies `✅ Збережено AA1234BB` when it has indexed the photo.

Search later:

```text
/find AA1234BB
```

The bot accepts spacing and Ukrainian/Latin lookalikes (`АА 1234 ВВ` becomes `AA1234BB`). It stores the normalized number plus the original Telegram message URL — not a duplicate of the photo.

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
5. Use photo captions in the agreed format (`#AA1234BB`) and `/find AA1234BB`.

## Operational notes

- The bot indexes only messages it receives after it is added; it does not backfill group history.
- Direct links for private groups work only for people who are members of that group.
- `ALLOWED_CHAT_IDS` should always be set in production.
- `data/index.db` is the durable index; back it up securely. Do not expose it or the `.env` file.

## Quality checks

```bash
npm test
npm run typecheck
npm run lint
```
