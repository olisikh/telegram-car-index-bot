# Docker deployment

The project ships as one self-contained image: Node.js, compiled bot, Python, YOLO detector, FastPlateOCR, the plate-detector weights, and the OCR model are included. It needs no Ollama, Python installation, or model download on the target machine.

The only persistent state is the named Docker volume `car-index-data`, which contains SQLite and operational logs. Source photos and crops remain in memory only.

## Windows laptop: recommended method

Use the Docker method on Windows; it is simpler than installing Node.js, Python, YOLO, and FastPlateOCR separately.

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

4. In `.env`, set only the Telegram token, `ALLOWED_CHAT_IDS`, and recognition mode. The Compose file supplies the Linux paths inside the image, so do **not** change `PLATE_DETECTOR_*` paths for Windows.
5. Start it from that folder:

   ```powershell
   docker compose pull
   docker compose up -d
   docker compose ps
   ```

This is CPU-only: no NVIDIA driver, CUDA, WSL GPU setup, Node.js, or Python installation is required. A laptop with 16 GB RAM is recommended; allocate at least 6 GB to Docker Desktop/WSL if its resource limits were customized.

Docker uses a named Linux volume for the database rather than a Windows folder mount, avoiding Windows-file-system performance and permission issues.

## Brother's installation

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/).
2. Download `compose.yaml` and `.env.example` from the repository into an empty folder.
3. Rename `.env.example` to `.env` and enter the Telegram token and allowed group IDs.
4. If the GHCR package is private, sign in once with a GitHub personal access token that has `read:packages`:

   ```bash
   docker login ghcr.io
   ```

5. Start it:

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

Docker retains the `car-index-data` volume across image upgrades. Do **not** use `docker compose down -v` unless intentionally deleting the plate index and logs.

## Local image build

Developers can build the exact same one-image distribution:

```bash
docker build -t telegram-car-index-bot:local .
BOT_IMAGE=telegram-car-index-bot:local docker compose up -d
```

The GitHub Actions `Publish container image` workflow builds and publishes multi-architecture (`linux/amd64`, `linux/arm64`) images to `ghcr.io/olisikh/telegram-car-index-bot` for `v*` tags.
