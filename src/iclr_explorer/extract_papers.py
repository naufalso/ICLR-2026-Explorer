from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from .detail_parser import parse_detail_page
from .http import HttpClient
from .index_parser import PAPER_MINI_URL, extract_index_records
from .models import PaperRecord
from .schedule_parser import apply_calendar_schedule, apply_detail_schedule
from .write_outputs import build_summary, ensure_output_dir, write_csv, write_json


CALENDAR_URL = "https://iclr.cc/virtual/2026/calendar"
DETAIL_WORKERS = 8


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

    calendar_html = ""
    try:
        calendar_html = http.get_text(CALENDAR_URL)
        apply_calendar_schedule(merged_records, calendar_html)
    except Exception as exc:  # noqa: BLE001
        for record in merged_records:
            record.add_note(f"calendar fetch failed: {exc}")

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
    write_csv(merged_records, output_path / "papers.csv")
    write_json(summary, output_path / "extraction_summary.json")
    return summary


def main() -> None:
    args = parse_args()
    summary = run(output_dir=args.output_dir, refresh=args.refresh, limit=args.limit)
    print(f"Wrote {summary['total_papers_written']} papers to {args.output_dir}")


if __name__ == "__main__":
    main()
