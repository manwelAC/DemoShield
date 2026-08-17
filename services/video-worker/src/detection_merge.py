from __future__ import annotations

from typing import Any


def merge_findings(findings: list[dict[str, Any]], max_gap: float) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    for finding in sorted(findings, key=lambda item: item["startTime"]):
        match = next((item for item in reversed(merged) if _same_exposure(item, finding, max_gap)), None)
        if match is None:
            merged.append(finding.copy())
            continue
        match["endTime"] = max(match["endTime"], finding["endTime"])
        if finding["confidence"] > match["confidence"]:
            match["confidence"] = finding["confidence"]
            match["region"] = finding["region"]
    return merged


def _same_exposure(left: dict[str, Any], right: dict[str, Any], max_gap: float) -> bool:
    return (
        left["category"] == right["category"]
        and left.get("detectedText", "").casefold() == right.get("detectedText", "").casefold()
        and right["startTime"] - left["endTime"] <= max_gap
        and _intersection_over_union(left["region"], right["region"]) >= 0.25
    )


def _intersection_over_union(left: dict[str, float], right: dict[str, float]) -> float:
    x1 = max(left["x"], right["x"])
    y1 = max(left["y"], right["y"])
    x2 = min(left["x"] + left["width"], right["x"] + right["width"])
    y2 = min(left["y"] + left["height"], right["y"] + right["height"])
    intersection = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    union = left["width"] * left["height"] + right["width"] * right["height"] - intersection
    return intersection / union if union > 0 else 0.0
