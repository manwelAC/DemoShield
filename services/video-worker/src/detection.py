from __future__ import annotations

import hashlib
import re
from typing import Any


PATTERNS = [
    ("identity", "EMAIL ADDRESS", re.compile(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b")),
    ("network", "IP ADDRESS", re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")),
    ("credentials", "API TOKEN", re.compile(r"\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]{8,}\b")),
    ("credentials", "SECRET KEY", re.compile(r"\b(?:secret|token|password)\s*[:=]\s*[^\s]+", re.I)),
    ("identity", "WINDOWS USERNAME", re.compile(r"(?:[A-Za-z]:\\Users\\|/Users/|/home/)[^\\/\s]+", re.I)),
    ("identity", "PHONE NUMBER", re.compile(r"(?<!\d)(?:\+?\d[\d\s().-]{7,}\d)(?!\d)")),
    ("credentials", "JWT TOKEN", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b")),
    ("credentials", "BEARER TOKEN", re.compile(r"\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*", re.I)),
    ("network", "MAC ADDRESS", re.compile(r"\b(?:[0-9A-F]{2}[:-]){5}[0-9A-F]{2}\b", re.I)),
    ("notification", "MESSAGE NOTIFICATION", re.compile(r"\b(?:new message|notification|slack|microsoft teams)\b", re.I)),
]


def detect_text(text: str, timestamp: float = 0.0) -> list[dict[str, Any]]:
    """Classify text matches without sending content outside the local process."""
    findings = []
    for category, label, pattern in PATTERNS:
        for match in pattern.finditer(text):
            if not _valid_match(label, match.group(0)):
                continue
            findings.append({
                "category": category,
                "label": label,
                "detectedText": match.group(0),
                "confidence": 0.96,
                "startTime": timestamp,
                "endTime": timestamp + 3,
                "region": {"x": 0, "y": 0, "width": 1, "height": 0.08},
                "status": "pending",
            })
    return findings


def classify_ocr_text(item: Any, timestamp: float, sample_interval: float) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    normalized_text = _normalize_ocr_spacing(item.text)
    for category, label, pattern in PATTERNS:
        for match in pattern.finditer(normalized_text):
            detected_text = match.group(0)
            if not _valid_match(label, detected_text):
                continue
            position = f"{item.region['x']:.4f}:{item.region['y']:.4f}"
            identity = f"{category}:{label}:{detected_text.lower()}:{timestamp:.3f}:{position}"
            findings.append({
                "id": f"finding-{hashlib.sha1(identity.encode()).hexdigest()[:12]}",
                "category": category,
                "label": label,
                "detectedText": detected_text,
                "confidence": item.confidence,
                "startTime": timestamp,
                "endTime": timestamp + sample_interval,
                "region": item.region,
                "mode": "blur",
                "strength": 8,
                "padding": 4,
                "status": "pending",
            })
    return findings


def classify_ocr_items(items: list[Any], timestamp: float, sample_interval: float) -> list[dict[str, Any]]:
    """Classify individual OCR boxes and adjacent fragments from the same line."""
    findings: list[dict[str, Any]] = []
    for item in items:
        findings.extend(classify_ocr_text(item, timestamp, sample_interval))
    for combined in _combine_adjacent_items(items):
        findings.extend(classify_ocr_text(combined, timestamp, sample_interval))
    return _deduplicate_findings(findings)


class _CombinedOcrText:
    def __init__(self, text: str, confidence: float, region: dict[str, float]) -> None:
        self.text = text
        self.confidence = confidence
        self.region = region


def _combine_adjacent_items(items: list[Any]) -> list[_CombinedOcrText]:
    lines: list[list[Any]] = []
    for item in sorted(items, key=lambda value: (_center_y(value.region), value.region["x"])):
        line = next((candidate for candidate in lines if _same_line(candidate[0].region, item.region)), None)
        if line is None:
            lines.append([item])
        else:
            line.append(item)

    combined: list[_CombinedOcrText] = []
    for line in lines:
        ordered = sorted(line, key=lambda value: value.region["x"])
        group: list[Any] = []
        for item in ordered:
            if group and _horizontal_gap(group[-1].region, item.region) > 0.08:
                _append_combined(combined, group)
                group = []
            group.append(item)
        _append_combined(combined, group)
    return combined


def _append_combined(target: list[_CombinedOcrText], items: list[Any]) -> None:
    if len(items) < 2:
        return
    x1 = min(item.region["x"] for item in items)
    y1 = min(item.region["y"] for item in items)
    x2 = max(item.region["x"] + item.region["width"] for item in items)
    y2 = max(item.region["y"] + item.region["height"] for item in items)
    target.append(_CombinedOcrText(
        " ".join(item.text for item in items),
        min(float(item.confidence) for item in items),
        {"x": x1, "y": y1, "width": x2 - x1, "height": y2 - y1},
    ))


def _same_line(left: dict[str, float], right: dict[str, float]) -> bool:
    tolerance = max(left["height"], right["height"]) * 0.7
    return abs(_center_y(left) - _center_y(right)) <= tolerance


def _center_y(region: dict[str, float]) -> float:
    return region["y"] + region["height"] / 2


def _horizontal_gap(left: dict[str, float], right: dict[str, float]) -> float:
    return max(0.0, right["x"] - (left["x"] + left["width"]))


def _deduplicate_findings(findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    unique: list[dict[str, Any]] = []
    for finding in findings:
        duplicate = next((current for current in unique if (
            current["category"] == finding["category"]
            and current["detectedText"].casefold() == finding["detectedText"].casefold()
            and _intersection_over_union(current["region"], finding["region"]) >= 0.25
        )), None)
        if duplicate is None:
            unique.append(finding)
        elif _region_area(finding["region"]) < _region_area(duplicate["region"]):
            unique[unique.index(duplicate)] = finding
    return unique


def _valid_match(label: str, value: str) -> bool:
    if label == "PHONE NUMBER":
        return _is_probable_phone(value)
    if label == "IP ADDRESS":
        return all(0 <= int(part) <= 255 for part in value.split("."))
    return True


def _is_probable_phone(value: str) -> bool:
    candidate = value.strip()
    digits = re.sub(r"\D", "", candidate)
    if not 10 <= len(digits) <= 15:
        return False
    if re.search(r"\b(?:19|20)\d{2}[-/.]?\d{2}[-/.]?\d{2}\b", candidate):
        return False
    groups = re.findall(r"\d+", candidate)
    if len(groups) > 4 or (len(groups) == 4 and all(len(group) == 4 for group in groups)):
        return False
    if candidate.startswith("+") or "(" in candidate or ")" in candidate:
        return True
    if len(groups) == 1:
        return len(digits) in {10, 11}
    return 2 <= len(groups) <= 4 and 3 <= len(groups[-1]) <= 4


def _intersection_over_union(left: dict[str, float], right: dict[str, float]) -> float:
    x1 = max(left["x"], right["x"])
    y1 = max(left["y"], right["y"])
    x2 = min(left["x"] + left["width"], right["x"] + right["width"])
    y2 = min(left["y"] + left["height"], right["y"] + right["height"])
    intersection = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    union = _region_area(left) + _region_area(right) - intersection
    return intersection / union if union > 0 else 0.0


def _region_area(region: dict[str, float]) -> float:
    return region["width"] * region["height"]


def _normalize_ocr_spacing(text: str) -> str:
    """Repair common OCR spacing around punctuation in paths and identifiers."""
    return re.sub(r"\s*([@._:\\/=+-])\s*", r"\1", text.strip())
