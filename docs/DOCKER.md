# Docker deployment

The project ships as one self-contained image: Bun, compiled bot, Python, YOLO detector, FastPlateOCR, the plate-detector weights, and the OCR model are included. It needs no Ollama, host Python installation, or runtime model download on the target machine. Telegram photo downloads still use the Bot API; detector and OCR inference stay inside the container.

The named Docker volume `car-index-data` persists `/app/data`, including SQLite and its WAL/SHM files. A visible host folder, `./collection` by default, is bind-mounted at `/app/collection` for opt-in plate-crop training data. Application stdout and stderr are handled by Docker's logging driver and are viewed with `docker compose logs`; they are not files in the named volume. The runtime never saves full Telegram source photos.

## Windows laptop: recommended method

Use the Docker method on Windows; it is simpler than installing Bun, Python, YOLO, and FastPlateOCR separately.

### One-time setup

1. Install [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/).
   - Choose the **WSL 2** backend and keep **Linux containers** selected.
   - Most Windows laptops use the `x86_64` Docker Desktop installer; the published image also supports ARM64 Windows-on-ARM machines.
2. In PowerShell, confirm Docker is ready:

   ```powershell
   docker version
   docker compose version
   ```

3. Make a folder such as `C:\CarIndexBot`, then place `compose.yaml` and `.env.example` in it:

   ```powershell
   New-Item -ItemType Directory -Force C:\CarIndexBot
   Set-Location C:\CarIndexBot
   Copy-Item .env.example .env
   notepad .env
   ```

4. In `.env`, set the Telegram token and `ALLOWED_CHAT_IDS`. The Compose file supplies the Linux paths inside the image, so do **not** change `PLATE_DETECTOR_*` paths for Windows.
5. Start it from that folder:

   ```powershell
   docker compose pull
   docker compose up -d
   docker compose ps
   ```

This image is CPU-only: no NVIDIA driver, CUDA, WSL GPU setup, Bun, or Python installation is required on the host. This repository does not publish a measured minimum RAM allocation; if Docker Desktop has a custom memory cap, recognition must be tested under that cap.

Docker uses a named Linux volume for the database rather than a Windows folder mount, avoiding Windows-file-system performance and permission issues. The separate `collection` bind mount is intentionally visible: it is the portable crop corpus, not operational database state.

### Collection folder and handoff

`/collect` is enabled by default in each allowed chat. It writes only standard-pass processed plate crops plus `manifest.jsonl`; it never writes the original Telegram photo. Run `/collect off` in a group to stop future collection for that group, or `/collect on` to resume.

The default Windows folder is `C:\CarIndexBot\collection`. Zip that folder when handing a dataset to Oleksii. To use another local drive, set `HOST_COLLECTION_DIR` in `.env`, for example:

```dotenv
HOST_COLLECTION_DIR=D:\CarIndexTraining\collection
```

Do not use `docker compose down -v` for ordinary updates; it deletes the index volume. The host collection folder is outside that volume and remains available for inspection and backup.

## Brother's installation

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/).
2. Download `compose.yaml` and `.env.example` from the repository into an empty folder.
3. Rename `.env.example` to `.env` and enter the Telegram token and allowed group IDs.
4. In that folder, run:

   ```bash
   docker compose pull
   docker compose up -d
   ```

6. Check it:

   ```bash
   docker compose logs --tail=50 bot
   docker compose ps
   ```

The expected startup line contains `pipeline=detector-fast-ocr`.

## Updating

```bash
docker compose pull
docker compose up -d
```

The package is public, so `docker login` is not required. Compose defaults to `ghcr.io/olisikh/telegram-car-index-bot:latest` with `pull_policy: always`, ensuring `docker compose up -d` checks for the newest published image.

Docker retains the `car-index-data` volume across image upgrades. Do **not** use `docker compose down -v` unless intentionally deleting the SQLite index and per-chat settings.

## Local image build

Developers can build the exact same one-image distribution:

```bash
docker build -t telegram-car-index-bot:local .
BOT_IMAGE=telegram-car-index-bot:local BOT_PULL_POLICY=never docker compose up -d
```

The GitHub Actions `Publish container image` workflow is configured to build and publish public multi-architecture (`linux/amd64`, `linux/arm64`) images to `ghcr.io/olisikh/telegram-car-index-bot` for `v*` tags and manual workflow dispatches.

The detector and OCR model files are architecture-neutral. The Dockerfile downloads them once in a `$BUILDPLATFORM` stage and copies them into both target images, avoiding an emulated ARM64 Hugging Face download. GitHub Actions also exports BuildKit layers to the GitHub Actions cache so unchanged dependency and model layers can be reused by later builds.
