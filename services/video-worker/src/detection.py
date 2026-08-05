from __future__ import annotations

import re
from typing import Any


PATTERNS = [
    ("identity", "EMAIL ADDRESS", re.compile(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b")),
    ("network", "IP ADDRESS", re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")),
    ("credentials", "API TOKEN", re.compile(r"\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]{8,}\b")),
    ("credentials", "SECRET KEY", re.compile(r"\b(?:secret|token|password)\s*[:=]\s*[^\s]+", re.I)),
]


def detect_text(text: str, timestamp: float = 0.0) -> list[dict[str, Any]]:
    """Classify text matches without sending content outside the local process."""
    findings = []
    for category, label, pattern in PATTERNS:
        for match in pattern.finditer(text):
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
