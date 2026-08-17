from __future__ import annotations

import unittest
from dataclasses import dataclass

from src.detection import classify_ocr_items, detect_text


@dataclass(frozen=True)
class Item:
    text: str
    confidence: float
    region: dict[str, float]


def item(text: str, x: float, y: float, width: float = 0.1) -> Item:
    return Item(text, 0.95, {"x": x, "y": y, "width": width, "height": 0.04})


class DetectionTests(unittest.TestCase):
    def test_date_and_timestamp_are_not_phone_numbers(self) -> None:
        findings = detect_text("Recording 2026-07-29 11-02-44")
        self.assertNotIn("PHONE NUMBER", [finding["label"] for finding in findings])

    def test_formatted_phone_number_is_detected(self) -> None:
        findings = detect_text("Call +1 (415) 555-2671")
        self.assertIn("PHONE NUMBER", [finding["label"] for finding in findings])

    def test_adjacent_ocr_fragments_are_reassembled(self) -> None:
        findings = classify_ocr_items([
            item("admin", 0.10, 0.10, 0.05),
            item("@", 0.151, 0.10, 0.01),
            item("demo-app.com", 0.163, 0.10, 0.10),
            item("sk_live_abcdefgh1234", 0.10, 0.30, 0.18),
        ], timestamp=2.0, sample_interval=0.5)
        labels = {finding["label"] for finding in findings}
        self.assertEqual(labels, {"EMAIL ADDRESS", "API TOKEN"})

    def test_identical_values_in_different_regions_stay_separate(self) -> None:
        findings = classify_ocr_items([
            item("admin@example.com", 0.05, 0.10, 0.15),
            item("admin@example.com", 0.70, 0.70, 0.15),
        ], timestamp=1.0, sample_interval=0.5)
        emails = [finding for finding in findings if finding["label"] == "EMAIL ADDRESS"]
        self.assertEqual(len(emails), 2)
        self.assertNotEqual(emails[0]["id"], emails[1]["id"])


if __name__ == "__main__":
    unittest.main()
