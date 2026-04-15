from __future__ import annotations

import argparse
import csv
from pathlib import Path

from .models import CSV_COLUMNS, PaperRecord
from .write_outputs import ensure_output_dir, write_json


DEFAULT_SOURCE_CSV = Path("data/iclr2026/papers.csv")
DEFAULT_OUTPUT_JSON = Path("web/public/data/papers.json")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build frontend-ready JSON from the canonical papers CSV.")
    parser.add_argument("--source-csv", default=str(DEFAULT_SOURCE_CSV))
    parser.add_argument("--output-json", default=str(DEFAULT_OUTPUT_JSON))
    return parser.parse_args()


def run(source_csv: str | Path = DEFAULT_SOURCE_CSV, output_json: str | Path = DEFAULT_OUTPUT_JSON) -> dict[str, object]:
    source_path = Path(source_csv)
    output_path = Path(output_json)

    if not source_path.exists():
        raise FileNotFoundError(f"Source CSV not found: {source_path}")

    papers = _load_papers(source_path)
    payload = _build_payload(papers, source_path)

    ensure_output_dir(output_path.parent)
    write_json(payload, output_path)
    return payload


def main() -> None:
    args = parse_args()
    payload = run(source_csv=args.source_csv, output_json=args.output_json)
    print(f"Wrote {payload['total_papers']} papers to {args.output_json}")


def _load_papers(source_path: Path) -> list[PaperRecord]:
    with source_path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        return [PaperRecord.from_dict(row) for row in reader]


def _build_payload(papers: list[PaperRecord], source_path: Path) -> dict[str, object]:
    topic_tags: set[str] = set()
    session_dates: set[str] = set()
    session_types: set[str] = set()

    normalized_papers: list[dict[str, object]] = []
    for paper in papers:
        paper_topic_tags = _split_pipe_values(paper.topic_tag)
        topic_tags.update(paper_topic_tags)
        if paper.session_date:
            session_dates.add(paper.session_date)
        if paper.session_type:
            session_types.add(paper.session_type)

        normalized_papers.append(
            {
                **paper.to_dict(),
                "authors_list": _split_authors(paper.authors),
                "topic_tags": paper_topic_tags,
                "topic_parts": [_parse_topic_part(topic) for topic in paper_topic_tags],
                "has_schedule": bool(paper.session_date or paper.session_title),
                "search_blob": " ".join(
                    filter(
                        None,
                        [
                            paper.title,
                            paper.authors,
                            paper.topic_tag,
                            paper.abstract,
                            paper.session_title,
                            paper.room,
                        ],
                    )
                ).lower(),
            }
        )

    return {
        "generated_at": papers[0].scraped_at if papers else "",
        "source_csv": str(source_path),
        "columns": CSV_COLUMNS,
        "total_papers": len(normalized_papers),
        "topic_tags": sorted(topic_tags),
        "session_dates": sorted(session_dates),
        "session_types": sorted(session_types),
        "unresolved_schedule_count": sum(1 for paper in papers if not (paper.session_date or paper.session_title)),
        "papers": normalized_papers,
    }


def _split_pipe_values(value: str) -> list[str]:
    return [part.strip() for part in value.split("|") if part.strip()]


def _split_authors(value: str) -> list[str]:
    if not value.strip():
        return []
    return [part.strip() for part in value.split("·") if part.strip()]


def _parse_topic_part(raw_value: str) -> dict[str, str]:
    if "->" not in raw_value:
        return {
            "raw": raw_value,
            "group": "",
            "name": raw_value,
        }
    group, name = [part.strip() for part in raw_value.split("->", 1)]
    return {
        "raw": raw_value,
        "group": group,
        "name": name,
    }


if __name__ == "__main__":
    main()
