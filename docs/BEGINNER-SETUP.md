# Beginner setup guide

This guide explains how to run the bot on a Mac, Windows PC, or Linux computer without needing to understand its code.

## What the bot needs

Keep one computer switched on while the bot is in use. It runs entirely on that computer:

```text
Telegram photos → local plate detector → local AI reader → local SQLite index
```

Nothing sends source photos to a cloud OCR service.

| Item | Recommended | Notes |
| --- | --- | --- |
| Memory | 16 GB RAM | The current local AI model is comfortable at one photo at a time. |
| Free disk space | 10 GB minimum; 20 GB recommended | The active Qwen model is about 6 GB. The detector Python environment is about 1.1 GB. |
| Internet | Required | Telegram access, initial code/model downloads, and normal bot operation. |
| Computer | Mac, Windows, or Linux | A GPU can improve speed but is not required. |

The production recognition stack uses:

```text
Node.js              Runs the bot
Python               Runs the local plate detector
Ollama               Runs the local vision model
SQLite               Stores the small plate/message index
```

## Before you start

You need:

- access to this GitHub repository;
- a Telegram bot created via `@BotFather`;
- a Telegram **supergroup** where the bot will work;
- the computer where the bot will run.

> [!IMPORTANT]
> Keep the bot token secret. It is equivalent to the bot's password. Never paste it into a group, commit it to Git, or share screenshots that show it.

## 1. Create and prepare the Telegram bot

Do this once in Telegram.

1. Open `@BotFather`.
2. Send `/newbot` and follow the prompts.
3. Copy the token BotFather gives you. It looks like `123456:ABC...`.
4. In BotFather, send `/setprivacy`.
5. Choose your bot, then choose **Disable**.
6. Add the bot to the target group.

If the bot was already in the group before you disabled Group Privacy, remove it and add it again. Telegram can otherwise continue delivering only commands.

### Use a supergroup

The bot needs a Telegram **supergroup** to produce clickable `/find` links back to the original photos. A private supergroup ID starts with `-100`.

If your group ID does **not** start with `-100`, convert it to a supergroup first:

1. Open the group → group name → **Edit** → **Group Type**.
2. Change it temporarily to **Public** and save. Telegram converts the group.
3. If you want the group private, change the type back to **Private**.
4. The new supergroup has a new ID. Use that new ID in the configuration below.

You do **not** need to make the bot an administrator.

### Find the group ID

Add `@RawDataBot` temporarily to the group, send a message, and find the value like this in its reply:

```text
chat.id: -1001234567890
```

Remove `@RawDataBot` afterward if you do not need it.

## 2. Download the project

Open a terminal.

### macOS / Linux

```bash
git clone https://github.com/olisikh/telegram-car-index-bot.git
cd telegram-car-index-bot
```

### Windows PowerShell

```powershell
git clone https://github.com/olisikh/telegram-car-index-bot.git
cd telegram-car-index-bot
```

If Git asks you to sign in, use the GitHub account that has access to this private repository.

## 3. Install the required software

Install these first if they are not already present:

| Software | Version | Where to get it |
| --- | --- | --- |
| Node.js | 22 or newer | [nodejs.org](https://nodejs.org/) |
| Python | 3.11 or newer | [python.org](https://www.python.org/) |
| Ollama | Current release | [ollama.com](https://ollama.com/) |
| Git | Current release | [git-scm.com](https://git-scm.com/) |

On Linux, install Node.js, Python, and Git using your distribution's package manager if preferred. Install Ollama using its official Linux instructions.

After installing, close and reopen your terminal. Then confirm the basics:

```bash
node --version
npm --version
python3 --version
ollama --version
```

On Windows PowerShell, use this for Python if `python3` is not available:

```powershell
py --version
```

## 4. Install the bot, detector, and local AI model

Run these commands inside the `telegram-car-index-bot` folder.

### macOS / Linux

```bash
cp .env.example .env
npm install

python3 -m venv .vision-venv
.vision-venv/bin/python -m pip install --upgrade pip
.vision-venv/bin/python -m pip install ultralytics huggingface_hub

mkdir -p models
.vision-venv/bin/hf download yasirfaizahmed/license-plate-object-detection best.pt --local-dir models
mv models/best.pt models/license-plate-detector.pt

ollama pull qwen2.5vl:7b
```

### Windows PowerShell

```powershell
Copy-Item .env.example .env
npm install

py -3 -m venv .vision-venv
.\.vision-venv\Scripts\python.exe -m pip install --upgrade pip
.\.vision-venv\Scripts\python.exe -m pip install ultralytics huggingface_hub

New-Item -ItemType Directory -Force models
.\.vision-venv\Scripts\hf.exe download yasirfaizahmed/license-plate-object-detection best.pt --local-dir models
Move-Item models\best.pt models\license-plate-detector.pt

ollama pull qwen2.5vl:7b
```

The first installation can take time because it downloads the local AI model. This is normal.

## 5. Fill in the configuration file

Open the file named `.env` in the project folder using a plain-text editor:

- macOS: TextEdit in plain-text mode, VS Code, or another code editor;
- Windows: Notepad or VS Code;
- Linux: a text editor such as VS Code, Kate, or Gedit.

Fill in your token and group ID. Use this as the starting configuration:

```dotenv
TELEGRAM_BOT_TOKEN=PASTE_YOUR_BOT_TOKEN_HERE
ALLOWED_CHAT_IDS=-1001234567890
DATABASE_PATH=./data/index.db

# Start safely: recognize photos but do not save results yet.
PHOTO_RECOGNITION_MODE=shadow

# Recommended local recognition path.
PHOTO_RECOGNITION_STRATEGY=detector-crop
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5vl:7b
OLLAMA_TIMEOUT_MS=60000

# macOS / Linux paths:
PLATE_DETECTOR_PYTHON=./.vision-venv/bin/python
PLATE_DETECTOR_SCRIPT=./scripts/detect_plate_crops.py
PLATE_DETECTOR_MODEL=./models/license-plate-detector.pt
```

For **Windows**, change only this line:

```dotenv
PLATE_DETECTOR_PYTHON=./.vision-venv/Scripts/python.exe
```

To allow more than one group or a private test chat, separate IDs with commas:

```dotenv
ALLOWED_CHAT_IDS=-1001234567890,-1009876543210
```

## 6. Test safely before saving anything

Start the bot from the project folder:

```bash
npm start
```

Keep that terminal open during the test.

In the Telegram group:

1. Send `/verbose on` so the bot shows the result for each photo.
2. Send a normal Telegram photo of a car.
   - Use **Send as photo**, not **Send as file**.
   - Send it from a human account, not another bot.
3. Wait for the bot's reply.

Expected feedback looks similar to:

```text
✅ Фото — ДНЗ: AA1234BB
⏱ 12.3 с
```

Or, if no plate was readable:

```text
⚠️ Фото — ДНЗ не розпізнано.
⏱ 12.3 с
```

While `PHOTO_RECOGNITION_MODE=shadow`, the bot does not write results to the database. Test several clear, distant, angled, and dark photos first.

> [!TIP]
> The bot deliberately reacts only to normal Telegram photo messages and commands. It ignores ordinary text, captions, videos, GIFs, and files sent as documents.

## 7. Turn on real indexing

After you are satisfied with the recognition results, change this line in `.env`:

```dotenv
PHOTO_RECOGNITION_MODE=index
```

Restart the bot. New recognized plates will now be saved locally.

Use these commands in the group:

```text
/find AA1234BB
/list
/verbose on
/verbose off
```

## Keep the bot running

> [!WARNING]
> Run only one copy of the bot with the same token. Starting a second copy causes Telegram polling conflicts and the bot will stop receiving messages.

### Temporary run on any platform

For a temporary session, leave this terminal open:

```bash
npm start
```

### macOS

This repository's current macOS deployment uses a LaunchAgent. See [MAINTENANCE.md](MAINTENANCE.md#production-process-macos-launchagent) for its status, restart, and log commands.

### Linux: run as a service

Create `/etc/systemd/system/telegram-car-index-bot.service` as an administrator. Replace `YOUR_USER` and `/home/YOUR_USER/telegram-car-index-bot` with the real Linux username and project folder.

```ini
[Unit]
Description=Telegram Car Index Bot
After=network-online.target ollama.service
Wants=network-online.target

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/home/YOUR_USER/telegram-car-index-bot
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Then run:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now telegram-car-index-bot
sudo systemctl status telegram-car-index-bot
```

Logs:

```bash
journalctl -u telegram-car-index-bot -f
```

If your `npm` command is not at `/usr/bin/npm`, find it with:

```bash
which npm
```

Then put that path into `ExecStart`.

### Windows: run at sign-in

The easiest option is **Task Scheduler**:

1. Open **Task Scheduler** → **Create Task**.
2. On **General**, choose **Run only when user is logged on**.
3. On **Triggers**, add **At log on** for the user who installed Ollama.
4. On **Actions**, choose **Start a program**.
5. Set:

   ```text
   Program/script: C:\Program Files\nodejs\npm.cmd
   Add arguments:  start
   Start in:        C:\path\to\telegram-car-index-bot
   ```

6. Save the task and use **Run** once to test it.

Use the same Windows account for Ollama and the scheduled bot. A more advanced unattended Windows installation can use NSSM or WinSW, but Task Scheduler is easier for a personal computer.

## Normal maintenance

### See whether the bot is receiving photos

Look for `photo=true` in the logs.

macOS/Linux:

```bash
tail -f data/bot.out.log
tail -f data/bot.err.log
```

Windows PowerShell:

```powershell
Get-Content .\data\bot.out.log -Wait
Get-Content .\data\bot.err.log -Wait
```

### Update the code

1. Stop the currently running bot service/process.
2. In the project folder, run:

   ```bash
   git pull
   npm install
   npm test
   npm run typecheck
   npm run lint
   ```

3. Start/restart the one managed bot service.

### Back up the index

The index is stored here:

```text
data/index.db
```

Back up this file securely. Do not share it publicly: it contains plate numbers and Telegram message links.

## If something does not work

| Symptom | First thing to check |
| --- | --- |
| Bot responds to commands but not photos | Disable Group Privacy, then remove and re-add the bot. Confirm the group is in `ALLOWED_CHAT_IDS`. |
| Bot ignores a picture sent as a file | Send it as a normal Telegram photo. Image documents are intentionally ignored. |
| Bot receives photos but crashes immediately | Check that the Python path, detector script, and detector model in `.env` exist. |
| Bot says no plate | Try a clearer/closer photo. The bot will not guess unreadable text. |
| `/find` cannot open a source photo | Confirm the group is a supergroup and that the viewer belongs to it. |
| Telegram `409 Conflict` error | Stop duplicate `npm start` sessions/services. Run one bot copy only. |
| Ollama connection error | Open Ollama and run `ollama list`; confirm it is available at `127.0.0.1:11434`. |

For technical diagnosis and production maintenance, see [MAINTENANCE.md](MAINTENANCE.md).
