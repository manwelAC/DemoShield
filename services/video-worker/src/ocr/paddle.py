from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any

import numpy as np


class OcrUnavailableError(RuntimeError):
    """Raised when the local PaddleOCR runtime is not installed."""


@dataclass(frozen=True)
class OcrText:
    text: str
    confidence: float
    region: dict[str, float]


class PaddleOcrEngine:
    """Lazy local PP-OCR pipeline optimized for screen-recording frames."""

    def __init__(self) -> None:
        # PaddlePaddle 3.x can select an incompatible oneDNN/PIR path on some
        # Windows CPUs. DemoShield favors compatibility over this optimization.
        os.environ.setdefault("FLAGS_use_mkldnn", "0")
        try:
            from paddleocr import PaddleOCR
        except ImportError as exc:
            raise OcrUnavailableError(
                "PaddleOCR is not installed. Install the video-worker OCR dependencies first."
            ) from exc
        self._pipeline = PaddleOCR(
            text_detection_model_name="PP-OCRv5_mobile_det",
            text_recognition_model_name="PP-OCRv5_mobile_rec",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            device="cpu",
            enable_mkldnn=False,
            cpu_threads=max(1, min(4, os.cpu_count() or 1)),
            text_recognition_batch_size=8,
        )

    def recognize(self, frame: np.ndarray) -> list[OcrText]:
        return self.recognize_many([frame])[0]

    def recognize_many(self, frames: list[np.ndarray]) -> list[list[OcrText]]:
        """Run a bounded image batch through one shared OCR pipeline call."""
        recognized_batches: list[list[OcrText]] = []
        for frame, result in zip(frames, self._pipeline.predict(frames), strict=True):
            height, width = frame.shape[:2]
            recognized: list[OcrText] = []
            data = _result_data(result)
            texts = data.get("rec_texts", [])
            scores = data.get("rec_scores", [])
            boxes = data.get("rec_boxes")
            polygons = data.get("rec_polys", [])
            for index, text in enumerate(texts):
                clean_text = str(text).strip()
                if not clean_text:
                    continue
                score = float(scores[index]) if index < len(scores) else 0.0
                raw_box = boxes[index] if boxes is not None and index < len(boxes) else polygons[index]
                region = _normalize_region(raw_box, width, height)
                recognized.append(OcrText(clean_text, score, region))
            recognized_batches.append(recognized)
        return recognized_batches


def _result_data(result: Any) -> dict[str, Any]:
    raw = getattr(result, "json", result)
    if callable(raw):
        raw = raw()
    if isinstance(raw, str):
        raw = json.loads(raw)
    if not isinstance(raw, dict):
        raise ValueError("PaddleOCR returned an unsupported result format")
    return raw.get("res", raw)


def _normalize_region(box: Any, frame_width: int, frame_height: int) -> dict[str, float]:
    points = np.asarray(box, dtype=float)
    if points.ndim == 1 and len(points) == 4:
        x1, y1, x2, y2 = points.tolist()
    else:
        points = points.reshape(-1, 2)
        x1, y1 = points.min(axis=0).tolist()
        x2, y2 = points.max(axis=0).tolist()
    return {
        "x": max(0.0, min(1.0, x1 / frame_width)),
        "y": max(0.0, min(1.0, y1 / frame_height)),
        "width": max(0.0, min(1.0, (x2 - x1) / frame_width)),
        "height": max(0.0, min(1.0, (y2 - y1) / frame_height)),
    }
