from __future__ import annotations

import csv
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from iclr_explorer.build_workshop_web_data import run as build_workshop_web_data
from iclr_explorer.extract_workshops import run as extract_workshops
from iclr_explorer.models import WORKSHOP_CSV_COLUMNS, WorkshopRecord
from iclr_explorer.workshop_parser import extract_workshop_records, parse_workshop_detail_page


FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


class WorkshopParserTests(unittest.TestCase):
    def test_extract_workshop_records_parses_list_cards(self) -> None:
        records = extract_workshop_records(fixture("workshops_list.html"))

        self.assertEqual(2, len(records))
        self.assertEqual("10000785", records[0].workshop_id)
        self.assertEqual("Workshop", records[0].event_type)
        self.assertEqual("2026-04-26", records[0].session_date)
        self.assertEqual("05:00", records[0].session_start)
        self.assertEqual("13:00", records[0].session_end)
        self.assertEqual("205", records[0].room)
        self.assertIn("time series foundation models", records[0].summary.lower())

    def test_parse_workshop_detail_page_extracts_schedule_and_project(self) -> None:
        record = WorkshopRecord(
            workshop_id="10000785",
            workshop_url="https://iclr.cc/virtual/2026/workshop/10000785",
        )

        parse_workshop_detail_page(fixture("detail_workshop.html"), record)

        self.assertEqual("1st ICLR Workshop on Time Series in the Age of Large Models", record.title)
        self.assertEqual("2026-04-26", record.session_date)
        self.assertEqual("05:00", record.session_start)
        self.assertEqual("13:00", record.session_end)
        self.assertEqual("PDT", record.timezone)
        self.assertEqual("https://tsalm-workshop.github.io/", record.project_page)
        self.assertIn("foundation models and agents", record.summary.lower())


class WorkshopEndToEndTests(unittest.TestCase):
    def test_extract_workshops_writes_outputs(self) -> None:
        list_html = fixture("workshops_list.html")
        detail_html = fixture("detail_workshop.html")
        url_map = {
            "https://iclr.cc/virtual/2026/events/workshop": list_html,
            "https://iclr.cc/virtual/2026/workshop/10000785": detail_html,
            "https://iclr.cc/virtual/2026/workshop/10000796": (
                "<html><body>"
                "<h1 class=\"event-title\">ICLR 2026 Workshop on AI with Recursive Self-Improvement</h1>"
                "<div class=\"event-organizers\">Mingchen Zhuge ⋅ AILING ZENG</div>"
                "<span class=\"meta-pill\">Sun, Apr 26, 2026 &bull; 5:00 AM &ndash; 1:00 PM PDT</span>"
                "<div class=\"abstract-text collapsed\"><div class=\"abstract-text-inner\">"
                "Recursive self-improvement is moving from thought experiments to deployed systems."
                "</div></div>"
                "</body></html>"
            ),
        }

        class FakeHttpClient:
            def __init__(self, *args, **kwargs) -> None:
                pass

            def get_text(self, url: str) -> str:
                if url not in url_map:
                    raise RuntimeError(f"Unexpected URL {url}")
                return url_map[url]

        with tempfile.TemporaryDirectory() as tmpdir:
            from unittest.mock import patch

            with patch("iclr_explorer.extract_workshops.HttpClient", FakeHttpClient):
                summary = extract_workshops(output_dir=tmpdir)

            files = {
                "workshops.csv",
                "workshops_raw_index.json",
                "workshops_enriched.json",
                "workshops_extraction_summary.json",
            }
            self.assertEqual(files, {path.name for path in Path(tmpdir).iterdir()})

            with (Path(tmpdir) / "workshops.csv").open(encoding="utf-8") as handle:
                reader = csv.DictReader(handle)
                rows = list(reader)

            self.assertEqual(WORKSHOP_CSV_COLUMNS, reader.fieldnames)
            self.assertEqual(2, len(rows))
            self.assertTrue(all(row["workshop_url"] for row in rows))
            self.assertIn(rows[0]["status"], {"ok", "partial"})
            self.assertEqual(2, summary["total_workshops_written"])

    def test_build_workshop_web_data_generates_helpers(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            source_csv = Path(tmpdir) / "workshops.csv"
            output_json = Path(tmpdir) / "workshops.json"

            with source_csv.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=WORKSHOP_CSV_COLUMNS)
                writer.writeheader()
                writer.writerow(
                    {
                        "workshop_id": "10000785",
                        "workshop_url": "https://example.test/workshop/10000785",
                        "title": "1st ICLR Workshop on Time Series in the Age of Large Models",
                        "organizers": "Arjun Ashok ⋅ Abdul Fatir Ansari ⋅ Elizabeth Fons",
                        "event_type": "Workshop",
                        "session_date": "2026-04-26",
                        "session_start": "05:00",
                        "session_end": "13:00",
                        "timezone": "PDT",
                        "room": "205",
                        "summary": "This workshop covers time series foundation models and agents.",
                        "project_page": "https://tsalm-workshop.github.io/",
                        "source_list_url": "https://example.test/events/workshop",
                        "source_detail_url": "https://example.test/workshop/10000785",
                        "scraped_at": "2026-04-16T08:00:00+00:00",
                        "status": "ok",
                        "notes": "",
                    }
                )

            payload = build_workshop_web_data(source_csv=source_csv, output_json=output_json)
            written_payload = json.loads(output_json.read_text(encoding="utf-8"))

            self.assertEqual(payload, written_payload)
            self.assertEqual(1, payload["total_workshops"])
            self.assertEqual(["Arjun Ashok", "Abdul Fatir Ansari", "Elizabeth Fons"], payload["workshops"][0]["organizers_list"])
            self.assertTrue(payload["workshops"][0]["has_schedule"])
            self.assertIn("time series foundation models", payload["workshops"][0]["search_blob"])


if __name__ == "__main__":
    unittest.main()
