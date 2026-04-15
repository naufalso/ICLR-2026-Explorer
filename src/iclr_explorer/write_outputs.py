from __future__ import annotations

import csv
import json
from pathlib import Path

from .models import CSV_COLUMNS, PaperRecord


def ensure_output_dir(output_dir: str | Path) -> Path:
    path = Path(output_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def write_csv(records: list[PaperRecord], output_path: str | Path) -> None:
    path = Path(output_path)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for record in records:
            writer.writerow(record.to_dict())


def write_json(payload: object, output_path: str | Path) -> None:
    path = Path(output_path)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def build_summary(records: list[PaperRecord], discovered_count: int) -> dict[str, object]:
    duplicate_urls = _duplicate_count([record.paper_url for record in records if record.paper_url])
    duplicate_titles = _duplicate_count([record.title for record in records if record.title])
    return {
        "total_papers_discovered": discovered_count,
        "total_papers_enriched": len(records),
        "total_papers_written": len(records),
        "total_papers_with_abstracts": sum(1 for record in records if record.abstract),
        "total_papers_with_schedule_metadata": sum(
            1 for record in records if record.session_date or record.session_title
        ),
        "total_papers_missing_required_fields": sum(
            1 for record in records if not record.title or not record.paper_url
        ),
        "duplicate_url_count": duplicate_urls,
        "duplicate_title_count": duplicate_titles,
    }


def _duplicate_count(values: list[str]) -> int:
    seen: set[str] = set()
    duplicates = 0
    for value in values:
        if value in seen:
            duplicates += 1
            continue
        seen.add(value)
    return duplicates
