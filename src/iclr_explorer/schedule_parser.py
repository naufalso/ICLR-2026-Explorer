from __future__ import annotations

from collections import defaultdict
from datetime import datetime
import re

from .models import CalendarEvent, PaperRecord
from .parser_utils import normalize_title, parse_tokens


DAY_HEADER_RE = re.compile(r"^(MON|TUE|WED|THU|FRI|SAT|SUN)\s+(\d{1,2})\s+([A-Z]{3})$")
TIME_RE = re.compile(r"^\d{1,2}(:\d{2})?\s*(a\.m\.|p\.m\.)$", re.IGNORECASE)
SESSION_TITLE_RE = re.compile(r"^(Oral Session|Poster Session|Poster|Workshop)\b")
SESSION_RANGE_RE = re.compile(r"\[(\d{1,2}:\d{2})-(\d{1,2}:\d{2})\]")
PAPER_LINE_RE = re.compile(r"^\[(\d{1,2}:\d{2})\]\s+(.+)$")
DETAIL_SESSION_RE = re.compile(
    r"^(Poster|Oral)\s+[A-Za-z]{3},\s+([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})\s+[•\-]\s+"
    r"(\d{1,2}:\d{2}\s+[AP]M)\s+[–-]\s+(\d{1,2}:\d{2}\s+[AP]M)"
)
DETAIL_TIME_RE = re.compile(
    r"^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})\s+[•\-]\s+"
    r"(\d{1,2}:\d{2}\s+[AP]M)\s+[–-]\s+(\d{1,2}:\d{2}\s+[AP]M)(?:\s+[A-Z]{2,4})?$"
)
DETAIL_EVENT_TYPES = {"Poster", "Oral", "Workshop", "Spotlight"}
MONTHS = {
    "JAN": 1,
    "FEB": 2,
    "MAR": 3,
    "APR": 4,
    "MAY": 5,
    "JUN": 6,
    "JUL": 7,
    "AUG": 8,
    "SEP": 9,
    "OCT": 10,
    "NOV": 11,
    "DEC": 12,
}


def parse_detail_schedule(text: str) -> dict[str, str]:
    match = DETAIL_SESSION_RE.match(text)
    if not match:
        return {}
    session_type, month, day, year, start, end = match.groups()
    dt = datetime(int(year), MONTHS[month.upper()], int(day))
    return {
        "session_type": session_type,
        "session_date": dt.strftime("%Y-%m-%d"),
        "session_start": _normalize_clock(start),
        "session_end": _normalize_clock(end),
    }


def parse_detail_time(text: str) -> dict[str, str]:
    match = DETAIL_TIME_RE.match(text)
    if not match:
        return {}
    _, month, day, year, start, end = match.groups()
    dt = datetime(int(year), MONTHS[month.upper()], int(day))
    return {
        "session_date": dt.strftime("%Y-%m-%d"),
        "session_start": _normalize_clock(start),
        "session_end": _normalize_clock(end),
    }


def _normalize_clock(value: str) -> str:
    for pattern in ("%I:%M %p", "%I %p"):
        try:
            return datetime.strptime(value.upper(), pattern).strftime("%H:%M")
        except ValueError:
            continue
    return value


def parse_calendar_events(html: str) -> list[CalendarEvent]:
    texts = [token.text for token in parse_tokens(html)]
    events: list[CalendarEvent] = []
    current_date = ""
    current_event: CalendarEvent | None = None

    for text in texts:
        header = DAY_HEADER_RE.match(text)
        if header:
            _, day, month = header.groups()
            current_date = datetime(2026, MONTHS[month], int(day)).strftime("%Y-%m-%d")
            current_event = None
            continue

        if SESSION_TITLE_RE.match(text):
            current_event = CalendarEvent(
                session_title=text,
                session_type=_extract_session_type(text),
                session_date=current_date,
            )
            range_match = SESSION_RANGE_RE.search(text)
            if range_match:
                current_event.session_start = range_match.group(1)
                current_event.session_end = range_match.group(2)
            events.append(current_event)
            continue

        if current_event is None:
            continue

        paper_match = PAPER_LINE_RE.match(text)
        if paper_match:
            _, paper_title = paper_match.groups()
            current_event.paper_titles.append(paper_title)
            continue

        if text.startswith("(ends ") and current_event.session_end == "":
            end_time = text.replace("(ends ", "").replace(")", "")
            current_event.session_end = _normalize_clock(end_time)
            continue

        if (
            text
            and not TIME_RE.match(text)
            and not SESSION_TITLE_RE.match(text)
            and not text.startswith("Filter ")
            and current_event.room == ""
            and not text.lower().startswith("oral s")
            and not text.startswith("(")
        ):
            current_event.room = text

    return events


def apply_calendar_schedule(records: list[PaperRecord], calendar_html: str) -> None:
    title_map: dict[str, list[CalendarEvent]] = defaultdict(list)
    for event in parse_calendar_events(calendar_html):
        for title in event.paper_titles:
            title_map[normalize_title(title)].append(event)

    for record in records:
        normalized = normalize_title(record.title)
        if not normalized or normalized not in title_map:
            continue
        matches = title_map[normalized]
        if len(matches) != 1:
            record.add_note("multiple calendar matches found")
            continue
        event = matches[0]
        if not record.session_title:
            record.session_title = event.session_title
        if not record.session_type:
            record.session_type = event.session_type
        if not record.session_date:
            record.session_date = event.session_date
        if not record.session_start:
            record.session_start = event.session_start
        if not record.session_end:
            record.session_end = event.session_end
        if not record.room:
            record.room = event.room
        if any([event.session_title, event.session_date, event.session_start, event.session_end]):
            record.schedule_source = record.schedule_source or "calendar_exact_title"


def apply_detail_schedule(record: PaperRecord, detail_html: str) -> None:
    texts = [token.text for token in parse_tokens(detail_html)]
    for text in texts:
        parsed = parse_detail_schedule(text)
        if not parsed:
            continue
        record.session_type = record.session_type or parsed.get("session_type", "")
        record.session_date = record.session_date or parsed.get("session_date", "")
        record.session_start = record.session_start or parsed.get("session_start", "")
        record.session_end = record.session_end or parsed.get("session_end", "")
        record.schedule_source = record.schedule_source or "detail_page"
        break

    normalized_title = normalize_title(record.title)
    if not normalized_title:
        return

    title_index = -1
    for index, text in enumerate(texts):
        if normalize_title(text) == normalized_title:
            title_index = index
            break
    if title_index <= 0:
        return

    time_index = -1
    parsed_time: dict[str, str] = {}
    for index in range(max(0, title_index - 4), title_index):
        candidate = parse_detail_time(texts[index])
        if candidate:
            time_index = index
            parsed_time = candidate
            break
    if time_index == -1:
        return

    if time_index > 0 and texts[time_index - 1] in DETAIL_EVENT_TYPES:
        record.session_type = record.session_type or texts[time_index - 1]

    record.session_date = record.session_date or parsed_time.get("session_date", "")
    record.session_start = record.session_start or parsed_time.get("session_start", "")
    record.session_end = record.session_end or parsed_time.get("session_end", "")

    room_index = title_index - 1
    if room_index > time_index:
        room = texts[room_index].strip()
        if room and room not in DETAIL_EVENT_TYPES:
            record.room = record.room or room

    record.schedule_source = record.schedule_source or "detail_page"


def _extract_session_type(value: str) -> str:
    if value.startswith("Oral"):
        return "Oral"
    if value.startswith("Poster"):
        return "Poster"
    if value.startswith("Workshop"):
        return "Workshop"
    return ""
