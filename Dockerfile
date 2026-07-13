# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS node-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
ENV DEBIAN_FRONTEND=noninteractive \
    PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATABASE_PATH=/app/data/index.db \
    PLATE_DETECTOR_PYTHON=/opt/venv/bin/python \
    PLATE_DETECTOR_SCRIPT=/app/scripts/detect_and_read_plates.py \
    PLATE_DETECTOR_MODEL=/app/models/license-plate-detector.pt \
    FAST_PLATE_OCR_MODEL=cct-s-v2-global-model
RUN apt-get update && apt-get install --no-install-recommends -y \
      ca-certificates \
      libgl1 \
      libglib2.0-0 \
      python3 \
      python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt
COPY --from=node-build /app/package.json ./
COPY --from=node-build /app/node_modules ./node_modules
COPY --from=node-build /app/dist ./dist
COPY scripts ./scripts
RUN mkdir -p /app/models /app/data \
    && python -c "from huggingface_hub import hf_hub_download; hf_hub_download(repo_id='yasirfaizahmed/license-plate-object-detection', filename='best.pt', local_dir='/app/models')" \
    && mv /app/models/best.pt /app/models/license-plate-detector.pt \
    && python -c "from fast_plate_ocr import LicensePlateRecognizer; LicensePlateRecognizer('cct-s-v2-global-model')"

CMD ["node", "dist/index.js"]
