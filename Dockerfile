# syntax=docker/dockerfile:1

FROM --platform=$BUILDPLATFORM python:3.11-slim AS model-assets
ENV PIP_NO_CACHE_DIR=1 \
    HF_HUB_DISABLE_XET=1
RUN python3 -m venv /opt/model-venv
ENV PATH=/opt/model-venv/bin:$PATH
RUN pip install --upgrade pip \
    && pip install huggingface-hub==1.23.0 'fast-plate-ocr[onnx]==1.1.0'
RUN mkdir -p /models \
    && python -c "from huggingface_hub import hf_hub_download; hf_hub_download(repo_id='yasirfaizahmed/license-plate-object-detection', filename='best.pt', local_dir='/models')" \
    && mv /models/best.pt /models/license-plate-detector.pt \
    && python -c "from fast_plate_ocr import LicensePlateRecognizer; LicensePlateRecognizer('cct-s-v2-global-model')" \
    && test -s /models/license-plate-detector.pt \
    && test -s /root/.cache/fast-plate-ocr/cct-s-v2-global-model/cct_s_v2_global.onnx

FROM node:24-bookworm-slim AS bun-build
RUN apt-get update && apt-get install -y --no-install-recommends curl unzip ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN bun run build

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=bun-build /root/.bun/bin/bun /usr/local/bin/bun
ENV DEBIAN_FRONTEND=noninteractive \
    PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATABASE_PATH=/app/data/index.db \
    PLATE_DETECTOR_PYTHON=/opt/venv/bin/python \
    PLATE_DETECTOR_SCRIPT=/app/scripts/detect_and_read_plates.py \
    PLATE_DETECTOR_MODEL=/app/models/license-plate-detector.pt \
    FAST_PLATE_OCR_MODEL=cct-s-v2-global-model \
    COLLECTION_DIR=/app/collection
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
RUN pip install --upgrade pip \
    && pip install --index-url https://download.pytorch.org/whl/cpu torch==2.0.1 torchvision==0.15.2 \
    && pip install -r requirements.txt
COPY --from=bun-build /app/package.json ./
COPY --from=bun-build /app/node_modules ./node_modules
COPY --from=bun-build /app/dist ./dist
COPY scripts ./scripts
COPY --from=model-assets /models/license-plate-detector.pt /app/models/license-plate-detector.pt
COPY --from=model-assets /root/.cache/fast-plate-ocr /root/.cache/fast-plate-ocr
RUN mkdir -p /app/data /app/collection \
    && test -s /app/models/license-plate-detector.pt \
    && test -s /root/.cache/fast-plate-ocr/cct-s-v2-global-model/cct_s_v2_global.onnx

CMD ["bun", "dist/index.js"]
