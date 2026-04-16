from __future__ import annotations

import csv
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from iclr_explorer.detail_parser import parse_companion_presentation, parse_detail_page
from iclr_explorer.extract_papers import run
from iclr_explorer.index_parser import extract_index_records, parse_topic_filter_options
from iclr_explorer.models import CSV_COLUMNS, PaperRecord
from iclr_explorer.schedule_parser import (
    apply_calendar_schedule,
    apply_detail_schedule,
    parse_calendar_events,
    parse_listed_events,
)


FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


class ParserTests(unittest.TestCase):
    def test_index_parser_extracts_topic_links_and_authors(self) -> None:
        html = fixture("index_topic.html")
        options = parse_topic_filter_options(html)
        self.assertIn("Social Aspects->Trustworthy Machine Learning", options)

        records = extract_index_records(html, source_list_url="https://example.test/list")
        self.assertEqual(2, len(records))
        self.assertEqual(
            "Revisiting the Past: Data Unlearning with Model State History",
            records[0].title,
        )
        self.assertTrue(records[0].authors.startswith("Keivan Rezaei"))
        self.assertEqual("", records[0].topic_tag)

    def test_detail_parser_extracts_abstract_links_and_schedule(self) -> None:
        record = PaperRecord(
            paper_id="10008720",
            paper_url="https://iclr.cc/virtual/2026/poster/10008720",
        )
        html = fixture("detail_poster.html")
        parse_detail_page(html, record)
        apply_detail_schedule(record, html)

        self.assertEqual(
            "Revisiting the Past: Data Unlearning with Model State History",
            record.title,
        )
        self.assertIn("massive corpora of web data", record.abstract)
        self.assertEqual("https://github.com/example/project", record.project_page)
        self.assertEqual("Poster", record.session_type)
        self.assertEqual("2026-04-24", record.session_date)
        self.assertEqual("06:30", record.session_start)
        self.assertEqual("09:00", record.session_end)
        self.assertEqual("Hall A", record.room)
        self.assertEqual("Computer Vision->Image and Video Generation", record.topic_tag)

    def test_calendar_parser_extracts_event_and_applies_by_title(self) -> None:
        calendar = fixture("calendar.html")
        events = parse_calendar_events(calendar)
        self.assertEqual(1, len(events))
        self.assertEqual("Poster Session 1 [06:30-09:00]", events[0].session_title)
        self.assertEqual("Hall A", events[0].room)

        record = PaperRecord(
            paper_id="10008720",
            paper_url="https://iclr.cc/virtual/2026/poster/10008720",
            title="Revisiting the Past: Data Unlearning with Model State History",
        )
        apply_calendar_schedule([record], calendar)
        self.assertEqual("Poster Session 1 [06:30-09:00]", record.session_title)
        self.assertEqual("2026-04-24", record.session_date)
        self.assertEqual("Hall A", record.room)
        self.assertEqual("calendar_exact_title", record.schedule_source)

    def test_parse_companion_presentation_from_detail_page(self) -> None:
        html = """
        <html><body>
          <div>Poster</div>
          <div>Thu, Apr 24, 2026 • 6:30 AM – 9:00 AM PDT</div>
          <div>Hall A</div>
          <div>Example Paper</div>
          <div>Jane Doe ⋅ John Smith</div>
          <a href="/virtual/2026/oral/10008721">Oral</a>
          <div>presentation:</div>
          <a href="/virtual/2026/session/10020000">Oral Session 1A Example Track</a>
        </body></html>
        """
        companion = parse_companion_presentation(html)
        self.assertEqual("Oral", companion["session_type"])
        self.assertEqual("Oral Session 1A Example Track", companion["session_title"])
        self.assertEqual("https://iclr.cc/virtual/2026/oral/10008721", companion["detail_url"])

    def test_parse_listed_events_extracts_oral_schedule(self) -> None:
        html = """
        <html><body>
          <div>Oral</div>
          <a href="/virtual/2026/oral/10008721">Example Paper</a>
          <div>Jane Doe ⋅ John Smith</div>
          <div>Apr 23, 6:30 AM - 6:40 AM</div>
          <div>Amphitheater</div>
        </body></html>
        """
        events = parse_listed_events(
            html,
            expected_session_type="Oral",
            detail_path_fragment="/virtual/2026/oral/",
        )
        self.assertEqual(1, len(events))
        self.assertEqual("Example Paper", events[0].title)
        self.assertEqual("2026-04-23", events[0].session_date)
        self.assertEqual("06:30", events[0].session_start)
        self.assertEqual("06:40", events[0].session_end)
        self.assertEqual("Amphitheater", events[0].room)


class EndToEndTests(unittest.TestCase):
    def test_smoke_run_writes_all_outputs(self) -> None:
        index_html = fixture("index_topic.html")
        detail_html = fixture("detail_poster.html")
        calendar_html = fixture("calendar.html")
        url_map = {
            "https://iclr.cc/virtual/2026/papers.html?layout=mini": index_html,
            "https://iclr.cc/virtual/2026/poster/10008720": detail_html,
            "https://iclr.cc/virtual/2026/oral/10008721": (
                "<html><body>"
                "<div>Oral</div>"
                "<div>Thu, Apr 24, 2026 • 10:00 AM – 10:10 AM PDT</div>"
                "<div>Auditorium</div>"
                "<div>Revisiting the Past: Data Unlearning with Model State History</div>"
                "<div>Keivan Rezaei · Mohammad Kazem Akbari · Albert Ghanem</div>"
                "<a href=\"/virtual/2026/poster/10008720\">Poster</a>"
                "<div>presentation:</div>"
                "<a href=\"/virtual/2026/session/10030000\">Poster Session 7 Hall A</a>"
                "</body></html>"
            ),
            "https://iclr.cc/virtual/2026/poster/10009999": (
                "<html><body>"
                "<h1>Safety Instincts: LLMs Learn to Trust Their Internal Compass for Self-Defense</h1>"
                "<meta name=\"keywords\" content=\"Social Aspects:Trustworthy Machine Learning\">"
                "<div>Jane Doe · John Smith</div></body></html>"
            ),
            "https://iclr.cc/virtual/2026/calendar": calendar_html,
            "https://iclr.cc/virtual/2026/events/oral": (
                "<html><body>"
                "<div>Oral</div>"
                "<a href=\"/virtual/2026/oral/10008721\">Revisiting the Past: Data Unlearning with Model State History</a>"
                "<div>Keivan Rezaei · Mohammad Kazem Akbari · Albert Ghanem</div>"
                "<div>Apr 24, 10:00 AM - 10:10 AM</div>"
                "<div>Auditorium</div>"
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

            with patch("iclr_explorer.extract_papers.HttpClient", FakeHttpClient):
                summary = run(output_dir=tmpdir)

            files = {
                "papers.csv",
                "papers_raw_index.json",
                "papers_enriched.json",
                "extraction_summary.json",
            }
            self.assertEqual(files, {path.name for path in Path(tmpdir).iterdir()})

            with (Path(tmpdir) / "papers.csv").open(encoding="utf-8") as handle:
                reader = csv.DictReader(handle)
                rows = list(reader)
            self.assertEqual(CSV_COLUMNS, reader.fieldnames)
            self.assertEqual(3, len(rows))
            self.assertTrue(all(row["title"] for row in rows))
            self.assertTrue(all(row["paper_url"] for row in rows))
            self.assertEqual(
                "Computer Vision->Image and Video Generation",
                rows[0]["topic_tag"],
            )
            poster_row = next(
                row
                for row in rows
                if row["title"] == "Revisiting the Past: Data Unlearning with Model State History"
                and row["session_type"] == "Poster"
            )
            oral_row = next(
                row
                for row in rows
                if row["title"] == "Revisiting the Past: Data Unlearning with Model State History"
                and row["session_type"] == "Oral"
            )
            missing_row = next(
                row
                for row in rows
                if row["title"] == "Safety Instincts: LLMs Learn to Trust Their Internal Compass for Self-Defense"
            )
            self.assertEqual("Poster Session 7 Hall A", poster_row["session_title"])
            self.assertEqual("Oral Session 1A Example Track", oral_row["session_title"])
            self.assertEqual("10:00", oral_row["session_start"])
            self.assertEqual("Auditorium", oral_row["room"])
            self.assertIn(missing_row["status"], {"missing_schedule", "missing_detail", "partial"})
            self.assertIn("schedule", missing_row["notes"])

            summary_payload = json.loads((Path(tmpdir) / "extraction_summary.json").read_text(encoding="utf-8"))
            self.assertEqual(3, summary_payload["total_papers_written"])
            self.assertIn("duplicate_title_count", summary_payload)


if __name__ == "__main__":
    unittest.main()
