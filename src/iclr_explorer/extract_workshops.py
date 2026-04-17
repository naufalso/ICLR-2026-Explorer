from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from .http import HttpClient
from .models import WORKSHOP_CSV_COLUMNS, WorkshopRecord
from .workshop_parser import WORKSHOP_LIST_URL, extract_workshop_records, parse_workshop_detail_page
from .write_outputs import ensure_output_dir, write_csv, write_json


DETAIL_WORKERS = 8


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract ICLR 2026 workshops into CSV/JSON artifacts.")
    parser.add_argument("--output-dir", default="data/iclr2026")
    parser.add_argument("--refresh", action="store_true", help="Ignore cached HTTP responses.")
    parser.add_argument("--limit", type=int, default=0, help="Limit workshop count for debugging.")
    return parser.parse_args()


def run(output_dir: str, refresh: bool = False, limit: int = 0) -> dict[str, object]:
    http = HttpClient(refresh=refresh)
    output_path = ensure_output_dir(output_dir)
    scraped_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    list_html = http.get_text(WORKSHOP_LIST_URL)
    records = extract_workshop_records(list_html, source_list_url=WORKSHOP_LIST_URL)
    records.sort(key=lambda record: record.title.lower())
    if limit > 0:
        records = records[:limit]

    detail_html_by_url: dict[str, str] = {}
    for record in records:
        record.scraped_at = scraped_at

    def fetch_detail(record: WorkshopRecord) -> tuple[WorkshopRecord, str | None, str | None]:
        try:
            detail_html = http.get_text(record.workshop_url)
            return record, detail_html, None
        except Exception as exc:  # noqa: BLE001
            return record, None, str(exc)

    with ThreadPoolExecutor(max_workers=DETAIL_WORKERS) as executor:
        futures = [executor.submit(fetch_detail, record) for record in records]
        for future in as_completed(futures):
            record, detail_html, error = future.result()
            if error is not None:
                record.add_note(f"detail fetch failed: {error}")
                continue
            if detail_html is None:
                record.add_note("detail fetch failed: no response body")
                continue
            detail_html_by_url[record.workshop_url] = detail_html
            parse_workshop_detail_page(detail_html, record)

    for record in records:
        _finalize_status(record)

    summary = {
        "generated_at": scraped_at,
        "source_url": WORKSHOP_LIST_URL,
        "total_workshops_written": len(records),
        "total_workshops_with_summary": sum(1 for record in records if record.summary),
        "total_workshops_with_project_page": sum(1 for record in records if record.project_page),
        "unresolved_schedule_count": sum(
            1 for record in records if not (record.session_date and record.session_start and record.session_end)
        ),
    }
    raw_index_payload = [record.to_dict() for record in records]
    enriched_payload = [
        {
            **record.to_dict(),
            "raw_html_available": record.workshop_url in detail_html_by_url,
        }
        for record in records
    ]

    write_json(raw_index_payload, output_path / "workshops_raw_index.json")
    write_json(enriched_payload, output_path / "workshops_enriched.json")
    write_csv(records, output_path / "workshops.csv", fieldnames=WORKSHOP_CSV_COLUMNS)
    write_json(summary, output_path / "workshops_extraction_summary.json")
    return summary


def main() -> None:
    args = parse_args()
    summary = run(output_dir=args.output_dir, refresh=args.refresh, limit=args.limit)
    print(f"Wrote {summary['total_workshops_written']} workshops to {args.output_dir}")


def _finalize_status(record: WorkshopRecord) -> None:
    missing = []
    if not record.title:
        missing.append("title")
    if not record.workshop_url:
        missing.append("workshop_url")
    if not record.summary:
        missing.append("summary")
    if not (record.session_date and record.session_start and record.session_end):
        missing.append("schedule")

    if not missing:
        record.status = "ok"
        return

    if missing == ["schedule"]:
        record.status = "missing_schedule"
    elif missing == ["summary"]:
        record.status = "partial"
    else:
        record.status = "partial"
    record.add_note(f"missing fields: {', '.join(missing)}")


if __name__ == "__main__":
    main()
