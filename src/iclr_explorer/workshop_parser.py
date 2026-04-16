from __future__ import annotations

from datetime import datetime
import re

from .models import WorkshopRecord
from .parser_utils import absolute_url, clean_text


WORKSHOP_LIST_URL = "https://iclr.cc/virtual/2026/events/workshop"

CARD_START_RE = re.compile(
    r'<div class="event-card touchup-date"[^>]*id="event-(?P<event_id>\d+)"[^>]*data-event-type="(?P<event_type>[^"]+)"[^>]*>',
    re.S,
)
TITLE_RE = re.compile(r'<h3 class="event-title">\s*<a href="(?P<href>[^"]+)">(?P<title>.*?)</a>', re.S)
ORGANIZERS_RE = re.compile(r'<div class="event-speakers">\s*(?P<organizers>.*?)\s*</div>', re.S)
TIME_RE = re.compile(r'<span class="touchup-time">\s*(?P<time>.*?)\s*</span>', re.S)
ROOM_RE = re.compile(
    r'<span class="meta-pill">\s*<i class="fas fa-map-marker-alt"></i>\s*<span>(?P<room>.*?)</span>',
    re.S,
)
SUMMARY_RE = re.compile(
    r'<div class="abstract-text" id="abstract-[^"]+">\s*(?P<summary>.*?)\s*</div>',
    re.S,
)
DETAIL_TIME_RE = re.compile(
    r"(?P<weekday>[A-Za-z]{3}),\s+(?P<month>[A-Za-z]{3})\s+(?P<day>\d{1,2}),\s+(?P<year>\d{4})\s+[•\-]\s+"
    r"(?P<start>\d{1,2}:\d{2}\s+[AP]M)\s+[–-]\s+(?P<end>\d{1,2}:\d{2}\s+[AP]M)\s*(?P<tz>[A-Z]{2,5})?"
)
LIST_TIME_RE = re.compile(
    r"(?P<month>[A-Za-z]{3})\s+(?P<day>\d{1,2}),\s+(?P<start>\d{1,2}:\d{2}\s+[AP]M)\s*-\s*(?P<end>\d{1,2}:\d{2}\s+[AP]M)"
)
PROJECT_PAGE_RE = re.compile(
    r'<a[^>]*class="action-btn project"[^>]*href="(?P<href>[^"]+)"',
    re.S,
)
EVENT_TITLE_RE = re.compile(r'<h1 class="event-title">(?P<title>.*?)</h1>', re.S)
EVENT_ORGANIZERS_RE = re.compile(r'<div class="event-organizers">\s*(?P<organizers>.*?)\s*</div>', re.S)
ABSTRACT_BLOCK_RE = re.compile(
    r'<div class="abstract-text(?:\s+collapsed)?"[^>]*>\s*<div class="abstract-text-inner">\s*(?P<summary>.*?)\s*</div>\s*</div>',
    re.S,
)


def extract_workshop_records(html: str, source_list_url: str = WORKSHOP_LIST_URL) -> list[WorkshopRecord]:
    matches = list(CARD_START_RE.finditer(html))
    records: list[WorkshopRecord] = []

    for index, match in enumerate(matches):
        block_end = matches[index + 1].start() if index + 1 < len(matches) else len(html)
        block = html[match.start() : block_end]

        title_match = TITLE_RE.search(block)
        if not title_match:
            continue

        workshop_url = absolute_url(title_match.group("href"))
        record = WorkshopRecord(
            workshop_id=match.group("event_id"),
            workshop_url=workshop_url,
            title=clean_text(_strip_tags(title_match.group("title"))),
            event_type=clean_text(match.group("event_type")),
            source_list_url=source_list_url,
        )

        organizers_match = ORGANIZERS_RE.search(block)
        if organizers_match:
            record.organizers = clean_text(_strip_tags(organizers_match.group("organizers")))

        room_match = ROOM_RE.search(block)
        if room_match:
            record.room = clean_text(_strip_tags(room_match.group("room")))

        summary_match = SUMMARY_RE.search(block)
        if summary_match:
            record.summary = clean_text(_strip_tags(summary_match.group("summary")))

        time_match = TIME_RE.search(block)
        if time_match:
            _apply_schedule(record, clean_text(_strip_tags(time_match.group("time"))))

        records.append(record)

    return records


def parse_workshop_detail_page(html: str, record: WorkshopRecord) -> WorkshopRecord:
    title_match = EVENT_TITLE_RE.search(html)
    if title_match:
        record.title = clean_text(_strip_tags(title_match.group("title"))) or record.title

    organizers_match = EVENT_ORGANIZERS_RE.search(html)
    if organizers_match:
        record.organizers = clean_text(_strip_tags(organizers_match.group("organizers"))) or record.organizers

    project_page_match = PROJECT_PAGE_RE.search(html)
    if project_page_match:
        record.project_page = absolute_url(project_page_match.group("href"))

    abstract_match = ABSTRACT_BLOCK_RE.search(html)
    if abstract_match:
        summary = clean_text(_strip_tags(abstract_match.group("summary")))
        if summary:
            record.summary = summary

    cleaned_html_text = clean_text(_strip_tags(html))

    meta_time_match = DETAIL_TIME_RE.search(cleaned_html_text)
    if meta_time_match:
        _apply_schedule(record, clean_text(meta_time_match.group(0)))

    if not record.session_date or not record.session_start or not record.session_end:
        record.add_note("workshop schedule missing from detail page")
    if not record.summary:
        record.add_note("summary missing from detail page")

    record.source_detail_url = record.workshop_url
    return record


def _apply_schedule(record: WorkshopRecord, raw_value: str) -> None:
    schedule = parse_workshop_schedule(raw_value)
    if not schedule:
        return
    record.session_date = schedule["session_date"]
    record.session_start = schedule["session_start"]
    record.session_end = schedule["session_end"]
    if schedule["timezone"]:
        record.timezone = schedule["timezone"]


def parse_workshop_schedule(raw_value: str) -> dict[str, str] | None:
    match = DETAIL_TIME_RE.search(raw_value)
    if match:
        year = int(match.group("year"))
        month = match.group("month")
        day = int(match.group("day"))
        timezone = match.group("tz") or ""
        return {
            "session_date": _to_date(year, month, day),
            "session_start": _to_time(match.group("start")),
            "session_end": _to_time(match.group("end")),
            "timezone": timezone,
        }

    match = LIST_TIME_RE.search(raw_value)
    if match:
        month = match.group("month")
        day = int(match.group("day"))
        return {
            "session_date": _to_date(2026, month, day),
            "session_start": _to_time(match.group("start")),
            "session_end": _to_time(match.group("end")),
            "timezone": "",
        }

    return None


def _to_date(year: int, month: str, day: int) -> str:
    return datetime.strptime(f"{year} {month} {day}", "%Y %b %d").strftime("%Y-%m-%d")


def _to_time(value: str) -> str:
    return datetime.strptime(value, "%I:%M %p").strftime("%H:%M")


def _strip_tags(value: str) -> str:
    return re.sub(r"<[^>]+>", " ", value or "")
