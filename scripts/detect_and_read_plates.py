#!/usr/bin/env python3
"""Detect and read license plates with FastPlateOCR, entirely in memory.

Input:  {"imageBase64": "..."} via stdin
Output: {"plates": ["AA1234BB"], "timings": {...}} via stdout

Images are decoded, cropped, and recognized in process memory only. This script
never writes Telegram media or crops to disk.
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
PROFILES = {
    "standard": (DEFAULT_CONFIDENCE, 0.15, 0.45, 4, False),
    "wide": (0.15, 0.25, 0.70, 5, False),
    "enhanced": (0.10, 0.35, 0.90, 6, True),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, help="Path to a local Ultralytics plate-detector .pt model")
    parser.add_argument("--confidence", type=float, default=DEFAULT_CONFIDENCE)
    parser.add_argument("--profile", choices=PROFILES, default="standard")
    parser.add_argument("--ocr-model", default="cct-s-v2-global-model")
    return parser.parse_args()


def crop_plate(image: np.ndarray, box: list[float], pad_x_ratio: float, pad_y_ratio: float, scale: int, enhance: bool) -> np.ndarray:
    x1, y1, x2, y2 = box
    height, width = image.shape[:2]
    plate_width = x2 - x1
    plate_height = y2 - y1
    pad_x = plate_width * pad_x_ratio
    pad_y = plate_height * pad_y_ratio
    left = max(0, int(x1 - pad_x))
    top = max(0, int(y1 - pad_y))
    right = min(width, int(x2 + pad_x))
    bottom = min(height, int(y2 + pad_y))
    crop = image[top:bottom, left:right]
    if crop.size == 0:
        raise ValueError("detector produced an empty crop")
    resized = cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    if not enhance:
        return resized
    lab = cv2.cvtColor(resized, cv2.COLOR_BGR2LAB)
    lightness, a_channel, b_channel = cv2.split(lab)
    enhanced = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(lightness)
    return cv2.cvtColor(cv2.merge((enhanced, a_channel, b_channel)), cv2.COLOR_LAB2BGR)


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

    confidence, pad_x_ratio, pad_y_ratio, scale, enhance = PROFILES[args.profile]
    detection_started = perf_counter()
    model = YOLO(args.model)
    result = model.predict(image, imgsz=1280, conf=min(args.confidence, confidence), verbose=False)[0]
    detections = [
        (float(box.conf[0]), [float(value) for value in box.xyxy[0].tolist()])
        for box in result.boxes
    ]
    detection_ms = round((perf_counter() - detection_started) * 1_000)

    cropping_started = perf_counter()
    crops = [
        cv2.cvtColor(crop_plate(image, box, pad_x_ratio, pad_y_ratio, scale, enhance), cv2.COLOR_BGR2RGB)
        for _, box in sorted(detections, reverse=True)[:MAX_CROPS]
    ]
    cropping_ms = round((perf_counter() - cropping_started) * 1_000)

    ocr_started = perf_counter()
    from fast_plate_ocr import LicensePlateRecognizer

    reader = LicensePlateRecognizer(args.ocr_model)
    plates: list[str] = []
    for crop in crops:
        for prediction in reader.run(crop, return_confidence=True):
            plate = getattr(prediction, "plate", None)
            if isinstance(plate, str):
                plates.append(plate)
    ocr_ms = round((perf_counter() - ocr_started) * 1_000)
    print(json.dumps({
        "plates": plates,
        "detections": len(detections),
        "timings": {"detectionMs": detection_ms, "croppingMs": cropping_ms, "ocrMs": ocr_ms},
    }, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"plate recognition failed: {error}", file=sys.stderr)
        raise SystemExit(1)
