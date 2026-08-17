from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

from .detection import detect_text
from .detection import classify_ocr_items
from .detection_merge import merge_findings
from .frames.sampler import sample_video
from .ocr.paddle import PaddleOcrEngine

_ocr_engine: PaddleOcrEngine | None = None


def get_ocr_engine() -> PaddleOcrEngine:
    global _ocr_engine
    if _ocr_engine is None:
        _ocr_engine = PaddleOcrEngine()
    return _ocr_engine
from .protocol import Request, Response


def emit(response: Response) -> None:
    sys.stdout.write(response.model_dump_json() + "\n")
    sys.stdout.flush()


def metadata(path: str) -> dict[str, Any]:
    source = Path(path)
    if not source.is_file():
        raise FileNotFoundError(f"Source video not found: {path}")
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=width,height", "-of", "json", path],
        capture_output=True, text=True, check=True,
    )
    probe = json.loads(result.stdout)
    stream = next((s for s in probe.get("streams", []) if "width" in s), {})
    digest = hashlib.sha256()
    with source.open("rb") as handle:
        digest.update(handle.read(1024 * 1024))
    return {"path": str(source), "fileName": source.name, "fileSize": source.stat().st_size,
            "duration": float(probe.get("format", {}).get("duration", 0)),
            "width": stream.get("width", 0), "height": stream.get("height", 0), "hash": digest.hexdigest()}


def handle(request: Request) -> Response:
    if request.command == "ping":
        return Response(id=request.id, data={"worker": "ready", "version": 1})
    if request.command == "metadata":
        return Response(id=request.id, data={"source": metadata(request.source or "")})
    if request.command == "scan":
        if not request.source:
            raise ValueError("Scan requires a source video path")
        emit(Response(id=request.id, event="progress", data={"phase": "ocr_loading", "progress": 0, "sampledFrames": 0, "totalSamples": 0}))
        ocr = get_ocr_engine()
        recognized_texts = 0

        def process_batch(frames: list[Any], timestamps: list[float]) -> list[dict[str, Any]]:
            nonlocal recognized_texts
            findings: list[dict[str, Any]] = []
            for timestamp, recognized in zip(timestamps, ocr.recognize_many(frames), strict=True):
                recognized_texts += len(recognized)
                findings.extend(classify_ocr_items(recognized, timestamp, request.sampleIntervalSeconds))
            return findings

        data = sample_video(
            request.source,
            request.sampleIntervalSeconds,
            lambda progress: emit(Response(id=request.id, event="progress", data=progress)),
            process_batch,
            heartbeat_seconds=request.heartbeatSeconds,
            change_threshold=request.changeThreshold,
            ocr_max_width=request.ocrMaxWidth,
            ocr_batch_size=request.ocrBatchSize,
        )
        data["findings"] = merge_findings(data["findings"], request.heartbeatSeconds * 1.1)
        data["stats"]["recognizedTexts"] = recognized_texts
        data["stats"]["matchedFindings"] = len(data["findings"])
        return Response(id=request.id, data=data)
    if request.command == "export":
        if not request.source or not request.output:
            raise ValueError("Export requires source and output paths")
        raise NotImplementedError("FFmpeg redaction renderer is the next worker milestone")
    raise ValueError(f"Unsupported command: {request.command}")


def main() -> None:
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            request = Request.model_validate_json(line)
            emit(handle(request))
        except Exception as exc:
            request_id = "unknown"
            try:
                request_id = json.loads(line).get("id", request_id)
            except json.JSONDecodeError:
                pass
            emit(Response(id=request_id, ok=False, event="error", error=str(exc)))


if __name__ == "__main__":
    main()
