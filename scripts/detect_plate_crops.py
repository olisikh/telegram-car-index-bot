#!/usr/bin/env python3
"""Detect license plates and return image crops or local OCR results as JSON on stdout.

Input:  {"imageBase64": "..."} via stdin
Output with --reader crops: {"crops": [{"imageBase64": "...", "confidence": 0.0, "box": [x1, y1, x2, y2}]}
Output with --reader fast-plate-ocr: {"plates": ["AA1234BB"]}

Images are decoded and cropped only in memory. This program never writes source
Telegram media to disk.
"""

from __future__ import annotations

import argparse
import base64
import json
import sys
from time import perf_counter
from typing import Any

import cv2
import numpy as np
from ultralytics import YOLO


MAX_INPUT_BYTES = 20 * 1024 * 1024
DEFAULT_CONFIDENCE = 0.25
MAX_CROPS = 5


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, help="Path to a local Ultralytics plate-detector .pt model")
    parser.add_argument("--confidence", type=float, default=DEFAULT_CONFIDENCE)
    parser.add_argument("--reader", choices=("crops", "fast-plate-ocr"), default="crops")
    parser.add_argument("--ocr-model", default="cct-s-v2-global-model")
    return parser.parse_args()


def crop_plate(image: np.ndarray, box: list[float]) -> np.ndarray:
    x1, y1, x2, y2 = box
    height, width = image.shape[:2]
    plate_width = x2 - x1
    plate_height = y2 - y1
    # Preserve a little vehicle context while giving the reader a high-resolution plate.
    pad_x = plate_width * 0.15
    pad_y = plate_height * 0.45
    left = max(0, int(x1 - pad_x))
    top = max(0, int(y1 - pad_y))
    right = min(width, int(x2 + pad_x))
    bottom = min(height, int(y2 + pad_y))
    crop = image[top:bottom, left:right]
    if crop.size == 0:
        raise ValueError("detector produced an empty crop")
    return cv2.resize(crop, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)


def main() -> int:
    args = parse_args()
    payload: dict[str, Any] = json.load(sys.stdin)
    encoded = payload.get("imageBase64")
    if not isinstance(encoded, str):
        raise ValueError("imageBase64 must be a string")
    raw = base64.b64decode(encoded, validate=True)
    if len(raw) > MAX_INPUT_BYTES:
        raise ValueError("image exceeds the 20 MiB analysis limit")
    image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("unable to decode image")

    detection_started = perf_counter()
    model = YOLO(args.model)
    result = model.predict(image, imgsz=1280, conf=args.confidence, verbose=False)[0]
    detections = []
    for box in result.boxes:
        confidence = float(box.conf[0])
        xyxy = [float(value) for value in box.xyxy[0].tolist()]
        detections.append((confidence, xyxy))
    detection_ms = round((perf_counter() - detection_started) * 1_000)

    selected = sorted(detections, reverse=True)[:MAX_CROPS]
    cropping_started = perf_counter()
    if args.reader == "fast-plate-ocr":
        # OpenCV stores images as BGR; FastPlateOCR expects in-memory RGB arrays.
        prepared_crops = [cv2.cvtColor(crop_plate(image, xyxy), cv2.COLOR_BGR2RGB) for _, xyxy in selected]
        cropping_ms = round((perf_counter() - cropping_started) * 1_000)

        # Import only for the lightweight-reader strategy so the established crop-only
        # contract remains usable without this optional dependency.
        ocr_started = perf_counter()
        from fast_plate_ocr import LicensePlateRecognizer

        reader = LicensePlateRecognizer(args.ocr_model)
        plates: list[str] = []
        for crop in prepared_crops:
            for prediction in reader.run(crop, return_confidence=True):
                plate = getattr(prediction, "plate", None)
                if isinstance(plate, str):
                    plates.append(plate)
        ocr_ms = round((perf_counter() - ocr_started) * 1_000)
        print(json.dumps({
            "plates": plates,
            "timings": {"detectionMs": detection_ms, "croppingMs": cropping_ms, "ocrMs": ocr_ms},
        }, separators=(",", ":")))
        return 0

    crops = []
    for confidence, xyxy in selected:
        crop = crop_plate(image, xyxy)
        ok, encoded_crop = cv2.imencode(".jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, 95])
        if not ok:
            raise ValueError("unable to encode plate crop")
        crops.append({
            "imageBase64": base64.b64encode(encoded_crop.tobytes()).decode("ascii"),
            "confidence": round(confidence, 4),
            "box": [round(value, 1) for value in xyxy],
        })
    cropping_ms = round((perf_counter() - cropping_started) * 1_000)

    print(json.dumps({
        "crops": crops,
        "timings": {"detectionMs": detection_ms, "croppingMs": cropping_ms},
    }, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # The Node caller surfaces only a safe failure category to Telegram.
        print(f"plate detector failed: {error}", file=sys.stderr)
        raise SystemExit(1)
