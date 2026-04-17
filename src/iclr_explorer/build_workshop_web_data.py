from __future__ import annotations

import argparse
import csv
from pathlib import Path

from .models import WORKSHOP_CSV_COLUMNS, WorkshopRecord
from .write_outputs import ensure_output_dir, write_json


DEFAULT_SOURCE_CSV = Path("data/iclr2026/workshops.csv")
DEFAULT_OUTPUT_JSON = Path("web/public/data/workshops.json")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build frontend-ready JSON from the canonical workshops CSV.")
    parser.add_argument("--source-csv", default=str(DEFAULT_SOURCE_CSV))
    parser.add_argument("--output-json", default=str(DEFAULT_OUTPUT_JSON))
    return parser.parse_args()


def run(
    source_csv: str | Path = DEFAULT_SOURCE_CSV,
    output_json: str | Path = DEFAULT_OUTPUT_JSON,
) -> dict[str, object]:
    source_path = Path(source_csv)
    output_path = Path(output_json)

    if not source_path.exists():
        raise FileNotFoundError(f"Source CSV not found: {source_path}")

    workshops = _load_workshops(source_path)
    payload = _build_payload(workshops, source_path)

    ensure_output_dir(output_path.parent)
    write_json(payload, output_path)
    return payload


def main() -> None:
    args = parse_args()
    payload = run(source_csv=args.source_csv, output_json=args.output_json)
    print(f"Wrote {payload['total_workshops']} workshops to {args.output_json}")


def _load_workshops(source_path: Path) -> list[WorkshopRecord]:
    with source_path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        return [WorkshopRecord.from_dict(row) for row in reader]


def _build_payload(workshops: list[WorkshopRecord], source_path: Path) -> dict[str, object]:
    session_dates: set[str] = set()
    rooms: set[str] = set()

    normalized_workshops: list[dict[str, object]] = []
    for workshop in workshops:
        if workshop.session_date:
            session_dates.add(workshop.session_date)
        if workshop.room:
            rooms.add(workshop.room)

        normalized_workshops.append(
            {
                **workshop.to_dict(),
                "organizers_list": _split_people(workshop.organizers),
                "has_schedule": bool(
                    workshop.session_date and workshop.session_start and workshop.session_end
                ),
                "search_blob": " ".join(
                    filter(
                        None,
                        [
                            workshop.title,
                            workshop.organizers,
                            workshop.summary,
                            workshop.room,
                            workshop.event_type,
                        ],
                    )
                ).lower(),
            }
        )

    return {
        "generated_at": workshops[0].scraped_at if workshops else "",
        "source_csv": str(source_path),
        "columns": WORKSHOP_CSV_COLUMNS,
        "total_workshops": len(normalized_workshops),
        "session_dates": sorted(session_dates),
        "rooms": sorted(rooms, key=_room_sort_key),
        "unresolved_schedule_count": sum(
            1 for workshop in workshops if not (workshop.session_date and workshop.session_start and workshop.session_end)
        ),
        "workshops": normalized_workshops,
    }


def _split_people(value: str) -> list[str]:
    if not value.strip():
        return []
    return [part.strip() for part in value.replace("⋅", "·").split("·") if part.strip()]


def _room_sort_key(value: str) -> tuple[int, str]:
    return (0, value.zfill(4)) if value.isdigit() else (1, value.lower())


if __name__ == "__main__":
    main()
