from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from collections import defaultdict
import re

from .detail_parser import parse_companion_presentation, parse_detail_page
from .http import HttpClient
from .index_parser import PAPER_MINI_URL, extract_index_records
from .models import CSV_COLUMNS, PaperRecord
from .parser_utils import normalize_title
from .schedule_parser import apply_calendar_schedule, apply_detail_schedule, parse_listed_events
from .write_outputs import build_summary, ensure_output_dir, write_csv, write_json


CALENDAR_URL = "https://iclr.cc/virtual/2026/calendar"
ORAL_EVENTS_URL = "https://iclr.cc/virtual/2026/events/oral"
DETAIL_WORKERS = 8
DETAIL_ID_RE = re.compile(r"/(?:oral|poster)/(\d+)(?:[/?#].*)?$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract ICLR 2026 papers into CSV/JSON artifacts.")
    parser.add_argument("--output-dir", default="data/iclr2026")
    parser.add_argument("--refresh", action="store_true", help="Ignore cached HTTP responses.")
    parser.add_argument("--limit", type=int, default=0, help="Limit paper count for debugging.")
    return parser.parse_args()


def merge_records(records: list[PaperRecord]) -> list[PaperRecord]:
    merged: dict[str, PaperRecord] = {}
    for record in records:
        key = record.paper_url
        existing = merged.get(key)
        if existing is None:
            merged[key] = record
            continue
        existing.add_topic(record.topic_tag)
        if not existing.authors and record.authors:
            existing.authors = record.authors
        if existing.source_list_url != record.source_list_url:
            existing.add_note(f"additional list source: {record.source_list_url}")
    return list(merged.values())


def finalize_status(record: PaperRecord) -> None:
    missing = []
    if not record.title:
        missing.append("title")
    if not record.paper_url:
        missing.append("paper_url")
    if not record.abstract:
        missing.append("abstract")
    if not (record.session_date or record.session_title):
        missing.append("schedule")

    if missing == ["abstract"]:
        record.status = "partial"
    elif "schedule" in missing and len(missing) == 1:
        record.status = "missing_schedule"
    elif "abstract" in missing and len(missing) > 1:
        record.status = "missing_detail"
    elif missing:
        record.status = "partial"
    else:
        record.status = "ok"

    if missing:
        record.add_note(f"missing fields: {', '.join(missing)}")


def run(output_dir: str, refresh: bool = False, limit: int = 0) -> dict[str, object]:
    http = HttpClient(refresh=refresh)
    output_path = ensure_output_dir(output_dir)
    scraped_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    main_index_html = http.get_text(PAPER_MINI_URL)
    raw_records = extract_index_records(main_index_html, source_list_url=PAPER_MINI_URL)

    merged_records = merge_records(raw_records)
    discovered_count = len(merged_records)
    merged_records.sort(key=lambda record: record.title.lower())
    if limit > 0:
        merged_records = merged_records[:limit]

    detail_html_by_url: dict[str, str] = {}
    companion_by_poster_url: dict[str, dict[str, str]] = {}
    for record in merged_records:
        record.scraped_at = scraped_at

    def fetch_detail(record: PaperRecord) -> tuple[PaperRecord, str | None, str | None]:
        try:
            detail_html = http.get_text(record.paper_url)
            return record, detail_html, None
        except Exception as exc:  # noqa: BLE001
            return record, None, str(exc)

    with ThreadPoolExecutor(max_workers=DETAIL_WORKERS) as executor:
        futures = [executor.submit(fetch_detail, record) for record in merged_records]
        for future in as_completed(futures):
            record, detail_html, error = future.result()
            if error is not None:
                record.add_note(f"detail fetch failed: {error}")
                continue
            if detail_html is None:
                record.add_note("detail fetch failed: no response body")
                continue
            detail_html_by_url[record.paper_url] = detail_html
            parse_detail_page(detail_html, record)
            apply_detail_schedule(record, detail_html)
            companion_by_poster_url[record.paper_url] = parse_companion_presentation(detail_html)

    calendar_html = ""
    try:
        calendar_html = http.get_text(CALENDAR_URL)
        apply_calendar_schedule(merged_records, calendar_html)
    except Exception as exc:  # noqa: BLE001
        for record in merged_records:
            record.add_note(f"calendar fetch failed: {exc}")

    oral_rows = _build_oral_rows(
        records=merged_records,
        http=http,
        scraped_at=scraped_at,
        companion_by_poster_url=companion_by_poster_url,
    )
    merged_records.extend(oral_rows)

    for record in merged_records:
        finalize_status(record)

    summary = build_summary(merged_records, discovered_count=discovered_count)
    raw_index_payload = [record.to_dict() for record in merged_records]
    enriched_payload = [
        {
            **record.to_dict(),
            "raw_html_available": record.paper_url in detail_html_by_url,
        }
        for record in merged_records
    ]

    write_json(raw_index_payload, output_path / "papers_raw_index.json")
    write_json(enriched_payload, output_path / "papers_enriched.json")
    write_csv(merged_records, output_path / "papers.csv", fieldnames=CSV_COLUMNS)
    write_json(summary, output_path / "extraction_summary.json")
    return summary


def _build_oral_rows(
    records: list[PaperRecord],
    http: HttpClient,
    scraped_at: str,
    companion_by_poster_url: dict[str, dict[str, str]],
) -> list[PaperRecord]:
    try:
        oral_events_html = http.get_text(ORAL_EVENTS_URL)
    except Exception as exc:  # noqa: BLE001
        for record in records:
            record.add_note(f"oral events fetch failed: {exc}")
        return []

    oral_events = parse_listed_events(
        oral_events_html,
        expected_session_type="Oral",
        detail_path_fragment="/virtual/2026/oral/",
    )
    if not oral_events:
        return []

    records_by_title: dict[str, list[PaperRecord]] = defaultdict(list)
    for record in records:
        records_by_title[normalize_title(record.title)].append(record)

    oral_detail_urls = sorted({event.detail_url for event in oral_events if event.detail_url})
    oral_companion_by_url: dict[str, dict[str, str]] = {}

    def fetch_oral_detail(url: str) -> tuple[str, str | None, str | None]:
        try:
            return url, http.get_text(url), None
        except Exception as exc:  # noqa: BLE001
            return url, None, str(exc)

    with ThreadPoolExecutor(max_workers=DETAIL_WORKERS) as executor:
        futures = [executor.submit(fetch_oral_detail, url) for url in oral_detail_urls]
        for future in as_completed(futures):
            url, detail_html, error = future.result()
            if error is not None:
                oral_companion_by_url[url] = {"error": error}
                continue
            if detail_html is None:
                oral_companion_by_url[url] = {"error": "no response body"}
                continue
            oral_companion_by_url[url] = parse_companion_presentation(detail_html)

    oral_rows: list[PaperRecord] = []
    for event in oral_events:
        normalized_title = normalize_title(event.title)
        matches = records_by_title.get(normalized_title, [])
        if len(matches) != 1:
            for record in matches:
                record.add_note("unable to create oral row: ambiguous title match")
            continue

        poster_record = matches[0]
        poster_companion = companion_by_poster_url.get(poster_record.paper_url, {})
        oral_session_title = poster_companion.get("session_title", "")

        oral_detail = oral_companion_by_url.get(event.detail_url, {})
        if oral_detail.get("error"):
            poster_record.add_note(f"oral detail fetch failed: {oral_detail['error']}")
        poster_session_title = oral_detail.get("session_title", "")
        poster_detail_url = oral_detail.get("detail_url", "")

        poster_record.session_type = "Poster"
        if poster_session_title:
            poster_record.session_title = poster_session_title
        elif poster_record.session_title.startswith("Oral Session"):
            poster_record.session_title = ""
        if poster_detail_url:
            poster_record.paper_url = poster_detail_url
            poster_record.source_detail_url = poster_detail_url
        poster_record.schedule_source = "detail_page" if poster_record.session_date else poster_record.schedule_source

        oral_record = PaperRecord.from_dict(poster_record.to_dict())
        oral_record.paper_id = _derive_oral_record_id(
            oral_detail_url=event.detail_url,
            fallback_poster_id=poster_record.paper_id,
        )
        oral_record.paper_url = event.detail_url or oral_record.paper_url
        oral_record.source_list_url = ORAL_EVENTS_URL
        oral_record.source_detail_url = event.detail_url or oral_record.source_detail_url
        oral_record.session_type = "Oral"
        oral_record.session_title = oral_session_title
        oral_record.session_date = event.session_date
        oral_record.session_start = event.session_start
        oral_record.session_end = event.session_end
        oral_record.room = event.room
        oral_record.schedule_source = "oral_events_page"
        oral_record.scraped_at = scraped_at
        oral_rows.append(oral_record)

    return oral_rows


def _derive_oral_record_id(oral_detail_url: str, fallback_poster_id: str) -> str:
    match = DETAIL_ID_RE.search(oral_detail_url or "")
    if match:
        return match.group(1)
    return f"{fallback_poster_id}-oral"


def main() -> None:
    args = parse_args()
    summary = run(output_dir=args.output_dir, refresh=args.refresh, limit=args.limit)
    print(f"Wrote {summary['total_papers_written']} papers to {args.output_dir}")


if __name__ == "__main__":
    main()
