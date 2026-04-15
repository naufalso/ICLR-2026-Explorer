from __future__ import annotations

import csv
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from iclr_explorer.build_web_data import run
from iclr_explorer.models import CSV_COLUMNS


class BuildWebDataTests(unittest.TestCase):
    def test_build_web_data_generates_helpers_and_preserves_columns(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            source_csv = Path(tmpdir) / "papers.csv"
            output_json = Path(tmpdir) / "papers.json"

            with source_csv.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=CSV_COLUMNS)
                writer.writeheader()
                writer.writerow(
                    {
                        "paper_id": "1001",
                        "paper_url": "https://example.test/paper/1001",
                        "title": "Trustworthy Systems for Multimodal Agents",
                        "authors": "Ada Lovelace · Grace Hopper",
                        "topic_tag": "Social Aspects->Trustworthy Machine Learning | Computer Vision->Vision Models & Multimodal",
                        "session_title": "Poster Session 1",
                        "session_type": "Poster",
                        "session_date": "2026-04-23",
                        "session_start": "11:15",
                        "session_end": "13:45",
                        "room": "Pavilion 4",
                        "abstract": "A paper about robust multimodal agents.",
                        "project_page": "https://example.test/project/1001",
                        "pdf_url": "",
                        "video_url": "",
                        "poster_url": "",
                        "code_url": "",
                        "source_list_url": "https://example.test/list",
                        "source_detail_url": "https://example.test/paper/1001",
                        "schedule_source": "detail_page",
                        "scraped_at": "2026-04-15T11:56:08+00:00",
                        "status": "ok",
                        "notes": "",
                    }
                )
                writer.writerow(
                    {
                        "paper_id": "1002",
                        "paper_url": "https://example.test/paper/1002",
                        "title": "Unscheduled Safety Analysis",
                        "authors": "Jane Doe",
                        "topic_tag": "Social Aspects->Trustworthy Machine Learning",
                        "session_title": "",
                        "session_type": "",
                        "session_date": "",
                        "session_start": "",
                        "session_end": "",
                        "room": "",
                        "abstract": "Missing schedule on purpose.",
                        "project_page": "",
                        "pdf_url": "",
                        "video_url": "",
                        "poster_url": "",
                        "code_url": "",
                        "source_list_url": "https://example.test/list",
                        "source_detail_url": "https://example.test/paper/1002",
                        "schedule_source": "",
                        "scraped_at": "2026-04-15T11:56:08+00:00",
                        "status": "missing_schedule",
                        "notes": "missing fields: schedule",
                    }
                )

            payload = run(source_csv=source_csv, output_json=output_json)
            written_payload = json.loads(output_json.read_text(encoding="utf-8"))

            self.assertEqual(2, payload["total_papers"])
            self.assertEqual(CSV_COLUMNS, payload["columns"])
            self.assertEqual(payload, written_payload)
            self.assertEqual(1, payload["unresolved_schedule_count"])

            first_paper = payload["papers"][0]
            self.assertEqual(["Ada Lovelace", "Grace Hopper"], first_paper["authors_list"])
            self.assertTrue(first_paper["has_schedule"])
            self.assertIn(
                {
                    "raw": "Social Aspects->Trustworthy Machine Learning",
                    "group": "Social Aspects",
                    "name": "Trustworthy Machine Learning",
                },
                first_paper["topic_parts"],
            )
            self.assertIn("trustworthy systems for multimodal agents", first_paper["search_blob"])

            second_paper = payload["papers"][1]
            self.assertFalse(second_paper["has_schedule"])
            self.assertEqual(
                [
                    {
                        "raw": "Social Aspects->Trustworthy Machine Learning",
                        "group": "Social Aspects",
                        "name": "Trustworthy Machine Learning",
                    }
                ],
                second_paper["topic_parts"],
            )

    def test_build_web_data_handles_missing_schedule_without_mutating_fields(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            source_csv = Path(tmpdir) / "papers.csv"
            output_json = Path(tmpdir) / "papers.json"

            with source_csv.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=CSV_COLUMNS)
                writer.writeheader()
                writer.writerow(
                    {
                        "paper_id": "1003",
                        "paper_url": "https://example.test/paper/1003",
                        "title": "Sparse Planning",
                        "authors": "",
                        "topic_tag": "",
                        "session_title": "",
                        "session_type": "",
                        "session_date": "",
                        "session_start": "",
                        "session_end": "",
                        "room": "",
                        "abstract": "",
                        "project_page": "",
                        "pdf_url": "",
                        "video_url": "",
                        "poster_url": "",
                        "code_url": "",
                        "source_list_url": "",
                        "source_detail_url": "",
                        "schedule_source": "",
                        "scraped_at": "",
                        "status": "missing_schedule",
                        "notes": "missing fields: schedule",
                    }
                )

            payload = run(source_csv=source_csv, output_json=output_json)
            paper = payload["papers"][0]
            self.assertFalse(paper["has_schedule"])
            self.assertEqual([], paper["authors_list"])
            self.assertEqual([], paper["topic_tags"])
            self.assertEqual([], paper["topic_parts"])
            self.assertIn("sparse planning", paper["search_blob"])


if __name__ == "__main__":
    unittest.main()
