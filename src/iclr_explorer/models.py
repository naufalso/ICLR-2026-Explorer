from __future__ import annotations

from dataclasses import asdict, dataclass, field


CSV_COLUMNS = [
    "paper_id",
    "paper_url",
    "title",
    "authors",
    "topic_tag",
    "session_title",
    "session_type",
    "session_date",
    "session_start",
    "session_end",
    "room",
    "abstract",
    "project_page",
    "pdf_url",
    "video_url",
    "poster_url",
    "code_url",
    "source_list_url",
    "source_detail_url",
    "schedule_source",
    "scraped_at",
    "status",
    "notes",
]

WORKSHOP_CSV_COLUMNS = [
    "workshop_id",
    "workshop_url",
    "title",
    "organizers",
    "event_type",
    "session_date",
    "session_start",
    "session_end",
    "timezone",
    "room",
    "summary",
    "project_page",
    "source_list_url",
    "source_detail_url",
    "scraped_at",
    "status",
    "notes",
]


@dataclass
class PaperRecord:
    paper_id: str = ""
    paper_url: str = ""
    title: str = ""
    authors: str = ""
    topic_tag: str = ""
    session_title: str = ""
    session_type: str = ""
    session_date: str = ""
    session_start: str = ""
    session_end: str = ""
    room: str = ""
    abstract: str = ""
    project_page: str = ""
    pdf_url: str = ""
    video_url: str = ""
    poster_url: str = ""
    code_url: str = ""
    source_list_url: str = ""
    source_detail_url: str = ""
    schedule_source: str = ""
    scraped_at: str = ""
    status: str = ""
    notes: str = ""
    _topic_tags: set[str] = field(default_factory=set, repr=False)

    def add_topic(self, topic_tag: str) -> None:
        normalized = topic_tag.strip()
        if not normalized:
            return
        self._topic_tags.add(normalized)
        self.topic_tag = " | ".join(sorted(self._topic_tags))

    def add_note(self, message: str) -> None:
        cleaned = message.strip()
        if not cleaned:
            return
        if self.notes:
            existing = {note.strip() for note in self.notes.split(";")}
            if cleaned in existing:
                return
            self.notes = f"{self.notes}; {cleaned}"
        else:
            self.notes = cleaned

    def to_dict(self) -> dict[str, str]:
        data = asdict(self)
        data.pop("_topic_tags", None)
        return {column: (data.get(column) or "") for column in CSV_COLUMNS}

    @classmethod
    def from_dict(cls, value: dict[str, str]) -> "PaperRecord":
        kwargs = {column: value.get(column, "") for column in CSV_COLUMNS}
        record = cls(**kwargs)
        for topic in filter(None, [part.strip() for part in record.topic_tag.split("|")]):
            record._topic_tags.add(topic)
        return record


@dataclass
class CalendarEvent:
    session_title: str = ""
    session_type: str = ""
    session_date: str = ""
    session_start: str = ""
    session_end: str = ""
    room: str = ""
    paper_titles: list[str] = field(default_factory=list)


@dataclass
class WorkshopRecord:
    workshop_id: str = ""
    workshop_url: str = ""
    title: str = ""
    organizers: str = ""
    event_type: str = ""
    session_date: str = ""
    session_start: str = ""
    session_end: str = ""
    timezone: str = ""
    room: str = ""
    summary: str = ""
    project_page: str = ""
    source_list_url: str = ""
    source_detail_url: str = ""
    scraped_at: str = ""
    status: str = ""
    notes: str = ""

    def add_note(self, message: str) -> None:
        cleaned = message.strip()
        if not cleaned:
            return
        if self.notes:
            existing = {note.strip() for note in self.notes.split(";")}
            if cleaned in existing:
                return
            self.notes = f"{self.notes}; {cleaned}"
        else:
            self.notes = cleaned

    def to_dict(self) -> dict[str, str]:
        data = asdict(self)
        return {column: (data.get(column) or "") for column in WORKSHOP_CSV_COLUMNS}

    @classmethod
    def from_dict(cls, value: dict[str, str]) -> "WorkshopRecord":
        kwargs = {column: value.get(column, "") for column in WORKSHOP_CSV_COLUMNS}
        return cls(**kwargs)
